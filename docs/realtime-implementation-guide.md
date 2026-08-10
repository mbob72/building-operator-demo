# Realtime: карта реализации

| Атрибут | Значение |
|---|---|
| Назначение | Навигация от протокола к конкретным классам и функциям |
| Аудитория | Разработчики, изменяющие или диагностирующие realtime |
| Родительская страница | [Realtime: передача данных, cursor и восстановление](realtime-data-flow-confluence.md) |

## Навигация

- [Обзор и термины](realtime-data-flow-confluence.md)
- [Примеры контрактных данных](realtime-contract-examples.md)
- [Recovery playbook](realtime-recovery-playbook.md)
- [Подробно о RealtimeClient и RealtimeHotStore](realtime-client-and-hot-store.md)
- [Frontend data consumption](frontend-data-consumption.md)

## Карта файлов

| Слой | Файл | Ответственность |
|---|---|---|
| Shared | [`domain-contracts.ts`](../src/shared/domain-contracts.ts) | Telemetry, patch, alarm, command и базовые types |
| Shared | [`api-contracts.ts`](../src/shared/api-contracts.ts) | HTTP snapshot и mutation contracts |
| Shared | [`realtime-contracts.ts`](../src/shared/realtime-contracts.ts) | Client/server WebSocket message unions |
| Backend | [`realtime-engine.ts`](../src/server/realtime-engine.ts) | Authoritative hot state, sequence, replay, simulator и command lifecycle |
| Backend | [`realtime-route.ts`](../src/server/realtime-route.ts) | WebSocket endpoint, resume validation, replay/resync и heartbeat |
| Backend | [`app.ts`](../src/server/app.ts) | HTTP snapshot, mutations и lifecycle engine |
| Frontend | [`operator-api.ts`](../src/client/src/operator-api.ts) | Schema-validated HTTP loaders/mutations |
| Frontend | [`realtime-hot-store.ts`](../src/client/src/realtime-hot-store.ts) | Indexed state, cursor и atomic batch application |
| Frontend | [`realtime-client.ts`](../src/client/src/realtime-client.ts) | Socket lifecycle, resume, reconnect и resync |
| Frontend | [`use-realtime-state.ts`](../src/client/src/use-realtime-state.ts) | Snapshot bootstrap, client composition и React selectors |

## Граница контрактов

Runtime Zod-схемы являются source of truth. Generated [`contracts/realtime.schema.json`](../contracts/realtime.schema.json) создаётся из них и не редактируется вручную.

```text
domain-contracts
  ├── DeviceTelemetrySchema
  ├── DeviceTelemetryPatchSchema
  ├── AlarmSchema
  └── CommandRecordSchema

api-contracts
  └── StateSnapshotSchema

realtime-contracts
  ├── ClientRealtimeMessageSchema
  ├── ServerRealtimeMessageSchema
  └── EventBatchMessageSchema
```

### Client messages

```text
ClientRealtimeMessage
  ├── subscribe
  └── resume
```

### Server messages

```text
ServerRealtimeMessage
  ├── hello
  ├── event.batch
  ├── resync.required
  └── heartbeat
```

### Realtime events

```text
RealtimeEvent
  ├── telemetry.patch
  ├── alarm.upsert
  ├── command.upsert
  └── catalog.invalidated
```

## Backend: RealtimeEngine

[`RealtimeEngine`](../src/server/realtime-engine.ts#L93) является in-memory authoritative владельцем hot operational state.

### Внутреннее состояние

| Поле | Назначение |
|---|---|
| `streamId` | Identity текущей жизни engine |
| `sequence` | Последний выданный global sequence |
| `telemetryByDeviceId` | Полная актуальная telemetry |
| `alarmsById` | Полные alarm records |
| `commandsById` | Полные command records |
| `replay` | Ограниченный массив sequenced events |
| `listeners` | Активные WebSocket subscriptions |

### snapshot()

[`snapshot()`](../src/server/realtime-engine.ts#L155) строит `StateSnapshot` из текущего состояния engine:

1. фильтрует telemetry по выбранным floors;
2. определяет вошедшие `deviceId`;
3. фильтрует alarms и commands тем же device scope;
4. добавляет текущие `streamId` и `sequence`;
5. валидирует результат через `StateSnapshotSchema.parse()`.

Snapshot содержит эффект всех событий до указанного sequence включительно.

### publishEvents()

[`publishEvents()`](../src/server/realtime-engine.ts#L185) — единственное место назначения global sequence:

```text
rawEvents
  → sequence = ++this.sequence для каждого event
  → replay.push(...events)
  → удалить старую часть сверх replayLimit
  → EventBatchMessageSchema.parse()
  → listener(batch) для каждого subscriber
```

Если `rawEvents` пуст, batch не создаётся и sequence не расходуется.

### publishTelemetryPatches()

[`publishTelemetryPatches()`](../src/server/realtime-engine.ts#L208):

- валидирует каждый patch;
- пропускает неизвестный `deviceId`;
- пропускает `revision <= current.revision`;
- мержит patch в полную telemetry;
- валидирует полный результат;
- обновляет authoritative map;
- одним вызовом `publishEvents()` создаёт batch из всех принятых patches.

### publishAlarmUpserts()

[`publishAlarmUpserts()`](../src/server/realtime-engine.ts#L230) принимает только допустимые lifecycle transitions. Новая alarm record должна начинаться в `active`; существующая не может вернуться из `acknowledged` в `active` или из `resolved` в более раннее состояние.

Одинаковый повторный record не создаёт новый event.

### command lifecycle

[`createCommand()`](../src/server/realtime-engine.ts#L283):

1. проверяет idempotency по `clientRequestId`;
2. проверяет device capability и confirmation;
3. создаёт `pending` record и публикует `command.upsert`;
4. timer переводит command в `accepted`;
5. следующий timer переводит в `executed`, `failed` или `timedOut`;
6. для `executed` позже публикуется telemetry patch результата;
7. command получает `resultTelemetryRevision` и публикуется ещё раз.

Каждый lifecycle record — отдельный global sequence.

### replayAfter()

[`replayAfter()`](../src/server/realtime-engine.ts#L179) возвращает:

| Условие | Результат |
|---|---|
| `afterSequence > current sequence` | `undefined` |
| cursor старше начала retention | `undefined` |
| cursor актуален, новых событий нет | `[]` |
| cursor актуален, есть хвост | events с `sequence > afterSequence` |

`undefined` означает, что replay невозможен и нужен snapshot. Пустой массив означает, что client уже догнал server.

## Backend: WebSocket route

Endpoint регистрируется в [`registerRealtimeRoute()`](../src/server/realtime-route.ts#L28).

### Connection lifecycle

Для каждого socket route:

1. создаёт уникальный `connectionId`;
2. запускает heartbeat timer;
3. ждёт первое client message;
4. валидирует JSON и scope;
5. отправляет `hello`;
6. для `resume` проверяет cursor;
7. replay-ит сохранённый хвост;
8. подписывает socket на новые engine batches;
9. на `close` очищает timer и listener.

### Порядок проверок resume

```text
streamId != engine.streamId
  → resync.required(streamChanged)

afterSequence > engine.latestSequence
  → resync.required(serverRestart)

engine.replayAfter(afterSequence) == undefined
  → resync.required(cursorExpired)

replay.length > 0
  → event.batch(replay)

затем engine.subscribe(live listener)
```

Обработка сообщения синхронна, поэтому simulator callback не может вклиниться между вычислением replay и установкой listener в том же event-loop turn.

## Frontend: bootstrap

[`useRealtimeBootstrap()`](../src/client/src/use-realtime-state.ts#L15) является composition root realtime frontend.

```text
useEffect
  → AbortController
  → loadStateSnapshot(), если store.ready=false
  → store.replaceSnapshot()
  → new RealtimeClient({ store, loadSnapshot, onCatalogInvalidated })
  → client.start()

cleanup
  → abort initial snapshot
  → client.stop()
```

Catalog invalidation связывается с TanStack Query через `invalidateQueries(['device-catalog'])`.

Store singleton переживает повторный mount в рамках browser runtime. Если он уже `ready`, bootstrap не загружает initial snapshot повторно, а сразу создаёт client и resume-ится от существующего cursor.

## Frontend: RealtimeClient

[`RealtimeClient`](../src/client/src/realtime-client.ts#L37) владеет transport lifecycle, но не доменным состоянием.

### Что хранит client

| Поле | Назначение |
|---|---|
| `socket` | Текущее WebSocket connection |
| `reconnectTimer` | Запланированная попытка подключения |
| `reconnectAttempt` | Счётчик backoff |
| `stopped` | Guard intentional shutdown |
| `resyncing` | Guard параллельных snapshot requests |

Cursor внутри client не кэшируется. Каждый `resume()` читает актуальные `streamId` и `sequence` из store.

### Обработка server messages

| Message | Действие |
|---|---|
| `hello` | при совместимом cursor отметить store как `live` |
| `event.batch` | передать в `store.applyBatch()` |
| `resync.required` | загрузить `snapshotPath` и заменить store |
| `heartbeat` | отметить live или повторить `resume` |

Если `applyBatch()` возвращает `gap`, `stream-mismatch` или `invalid-state`, client запускает resync. `duplicate` считается безопасной повторной доставкой.

### reconnect

Unexpected `close` удаляет ссылку на socket и планирует новый `connect()` с capped exponential delay. После `open` client снова отправляет resume от store cursor.

### resync

[`resync()`](../src/client/src/realtime-client.ts#L175):

```text
guard resyncing/stopped
  → connectionStatus=resyncing
  → loadSnapshot(path?)
  → store.replaceSnapshot(snapshot)
  → resume() от нового cursor
```

Socket во время HTTP request остаётся открытым. Если в это время приходят batches, они могут примениться к старому state, затем snapshot заменит его. Следующий resume запросит все events после sequence snapshot, поэтому итог снова сходится к server state.

## Frontend: RealtimeHotStore

[`RealtimeHotStore`](../src/client/src/realtime-hot-store.ts#L74) владеет client authoritative hot state и cursor.

### Snapshot shape

| Поле | Назначение |
|---|---|
| `telemetryByDeviceId` | Полная telemetry по device ID |
| `statusByDeviceId` | Быстрый status lookup для filters/rendering |
| `alarmsById` | Alarm records по ID |
| `commandsById` | Command records по ID |
| `dirtyStatusDeviceIds` | Devices со сменившимся status в последнем status batch |
| `streamId`, `sequence` | Realtime cursor |
| `ready` | Был ли установлен authoritative snapshot |
| `connectionStatus` | Transport/recovery state |
| `version` | Любая опубликованная store transition |
| `statusVersion` | Только изменение device status |
| `priorityMembershipVersion` | Изменение membership priority status |

### applyBatch stages

```text
1. stream identity check
2. duplicate check
3. fresh-event selection
4. gap check
5. lazy copy-on-write maps
6. event application
7. one atomic publish
```

Telemetry patch сначала мержится с current full record, затем весь результат повторно проходит `DeviceTelemetrySchema`. Это защищает store от семантически невозможного состояния.

### Direct upserts

`upsertAlarm()` и `upsertCommand()` используются для reconciliation HTTP mutation response. Они не изменяют `streamId` и `sequence`.

Command upsert сравнивает lifecycle rank:

```text
pending < accepted < executed | failed | timedOut
```

Это предотвращает regression от более медленного HTTP response.

## React consumption

[`useRealtimeSelector()`](../src/client/src/use-realtime-state.ts#L7) использует `useSyncExternalStore`.

Consumer подписывается не на network message, а на выбранное значение store snapshot:

```text
WebSocket batch
  → one store publish
  → selector(snapshot)
  → React render только при изменении выбранного значения
```

Примеры:

| Consumer | Выбранные данные |
|---|---|
| Toolbar | connection status и sequence |
| Device card | telemetry одного `deviceId` |
| Alarm panel | `alarmsById` и status lookup |
| Renderer | status map, dirty IDs и versions |

Value-only telemetry update создаёт новую telemetry map, но сохраняет identity status map. Это не заставляет status-oriented renderer перестраиваться.

## Validation boundaries

| Граница | Schema/check |
|---|---|
| Client → WebSocket server | `ClientRealtimeMessageSchema` + building/floor scope |
| Engine создаёт domain state | Domain Zod schemas |
| Engine создаёт batch | `EventBatchMessageSchema` |
| WebSocket server → browser | `ServerRealtimeMessageSchema` |
| HTTP snapshot → browser | `StateSnapshotSchema` |
| Telemetry patch → store | merge + `DeviceTelemetrySchema` |
| Cursor → store | stream, duplicate и gap checks |

## Известные ограничения и риски

### subscribe fallback не подключает live listener

Если store не имеет `streamId`, [`RealtimeClient.resume()`](../src/client/src/realtime-client.ts#L83) отправляет `subscribe`. Текущий route после `subscribe` отправляет `hello` и сразу возвращается, не вызывая `engine.subscribe()`.

Штатный `useRealtimeBootstrap` всегда сначала загружает snapshot и использует `resume`, поэтому normal flow не затронут. Но standalone fallback `subscribe` нельзя считать полноценной live subscription до исправления или уточнения контракта.

### Нет client heartbeat watchdog

Client реагирует на полученный heartbeat, но не запускает timer «heartbeat не пришёл вовремя». Silent half-open connection восстанавливается только после того, как WebSocket transport сам вызовет `close`/`error`.

### Backoff сбрасывается на WebSocket open

`reconnectAttempt` становится нулём сразу на `open`, до получения schema-valid `hello` или batch. Соединения, которые успешно открываются и сразу закрываются, каждый раз могут начинать backoff снова с 250 мс.

### State и replay находятся в памяти процесса

При полном перезапуске теряются telemetry mutations, commands и replay. Новый `streamId` не позволяет клиенту ошибочно продолжить старую последовательность, но persistent production state находится за границей текущего MVP.

### Building-scoped cursor

Current frontend не передаёт `floorIds` и использует один building stream. Route валидирует optional floor IDs, но live batches не фильтруются по этажу. Это согласуется с текущим building-scoped cursor: удаление событий другого этажа создало бы ложные gaps.

### Нет transport acknowledgement

Server считает socket listener подключённым после отправки replay, но client не подтверждает отдельные batches. Correctness обеспечивается resume cursor и snapshot resync, а не per-message ACK.

## Где покрыто тестами

| Поведение | Тест |
|---|---|
| Sequence assignment, batching, replay и snapshot | [`realtime-engine.test.ts`](../tests/api/realtime-engine.test.ts) |
| WebSocket resume и resync reasons | [`realtime-websocket.test.ts`](../tests/api/realtime-websocket.test.ts) |
| Client resume, reconnect, gap и resync | [`realtime-client.test.ts`](../tests/ui/realtime-client.test.ts) |
| Atomic store, duplicate, revision и dirty state | [`realtime-hot-store.test.ts`](../tests/ui/realtime-hot-store.test.ts) |
| Bootstrap и selective React subscription | [`use-realtime-state.test.tsx`](../tests/ui/use-realtime-state.test.tsx) |

## Checklist перед изменением realtime

- Изменён runtime Zod contract, а не generated JSON Schema.
- Новый event получает global sequence через `publishEvents()`.
- Snapshot отражает новое authoritative hot state.
- Replay остаётся непрерывным.
- Store применяет весь batch атомарно.
- Duplicate остаётся безопасным.
- Gap приводит к resync, а не к частичному применению.
- Telemetry revision проверяется внутри одного device.
- HTTP mutation response не двигает realtime cursor.
- Catalog, hot state и UI-only state остаются разделены.
- Обновлены frontend/backend architecture docs при material data-flow change.
- Выполнены `npm run verify` и `npm run test:e2e` для реализации изменений.
