# `RealtimeClient` и `RealtimeHotStore`

- Актуально на: 2026-08-10
- Текущий статус: объединённые этапы 10–11 завершены и приняты; MVP завершён
- Назначение: описание обязанностей и совместной работы двух основных realtime-классов frontend.

## Кратко

Realtime frontend разделён на два класса:

| Класс | Главный вопрос |
|---|---|
| [`RealtimeClient`](../src/client/src/realtime-client.ts#L37) | Как получить ordered сообщения, пережить disconnect и восстановиться? |
| [`RealtimeHotStore`](../src/client/src/realtime-hot-store.ts#L65) | Можно ли применить сообщение и каким становится актуальное состояние? |

```text
HTTP snapshot / WebSocket
            │
            ▼
    RealtimeClient
    transport lifecycle
            │ validated server message
            ▼
    RealtimeHotStore
    ordering + indexed state
            │ store notification
            ▼
 useRealtimeSelector → React consumers
```

`RealtimeClient` не хранит telemetry, alarms или commands. `RealtimeHotStore` не открывает socket, не запускает timers и не делает HTTP-запросы. Эта граница позволяет тестировать transport recovery отдельно от state transitions.

## Где создаётся связка

[`useRealtimeBootstrap`](../src/client/src/use-realtime-state.ts#L15) является composition root:

1. создаёт [`AbortController`](../src/client/src/use-realtime-state.ts#L20);
2. напрямую загружает [authoritative snapshot](../src/client/src/use-realtime-state.ts#L27);
3. передаёт его в [`operatorRealtimeStore.replaceSnapshot()`](../src/client/src/use-realtime-state.ts#L30);
4. создаёт [`RealtimeClient`](../src/client/src/use-realtime-state.ts#L32), передавая store и snapshot loader;
5. запускает client через [`start()`](../src/client/src/use-realtime-state.ts#L41);
6. при cleanup отменяет bootstrap и [останавливает client](../src/client/src/use-realtime-state.ts#L52).

Snapshot загружается до открытия WebSocket. Поэтому первый `resume` всегда содержит authoritative `streamId` и `sequence`.

## RealtimeClient

Исходник: [`src/client/src/realtime-client.ts`](../src/client/src/realtime-client.ts#L37).

### Ответственность

`RealtimeClient` отвечает за:

- построение `ws/wss` URL;
- открытие и закрытие socket;
- `resume` от текущего store cursor;
- runtime Zod validation server messages;
- маршрутизацию `hello`, `event.batch`, `heartbeat`, `resync.required`;
- reconnect с exponential backoff;
- HTTP snapshot resync через injected callback;
- invalidation стабильного catalog по специальному realtime event.

Он намеренно не решает:

- новее ли device revision;
- есть ли sequence gap;
- как мержить telemetry values;
- какие React-компоненты должны обновиться;
- какие GPU attributes являются dirty.

Это ответственность store и renderer.

### Зависимости конструктора

Options объявлены в [`realtime-client.ts:20`](../src/client/src/realtime-client.ts#L20):

| Зависимость | Назначение |
|---|---|
| `store` | cursor, connection status и применение batches |
| `loadSnapshot` | authoritative recovery без знания HTTP-реализации |
| `createSocket` | production `WebSocket` или fake socket в тестах |
| `realtimeUrl` | optional URL override |
| `now` | детерминированное время тестов |
| `schedule` / `cancelSchedule` | reconnect timers без привязки тестов к реальному времени |
| `onCatalogInvalidated` | связь realtime event со stable TanStack query |

Production defaults назначаются в [constructor](../src/client/src/realtime-client.ts#L52).

### Внутреннее состояние

Client хранит только transport lifecycle в [`realtime-client.ts:46`](../src/client/src/realtime-client.ts#L46):

```text
socket
reconnectTimer
reconnectAttempt
stopped
resyncing
```

`stopped` предотвращает reconnect после intentional cleanup. `resyncing` не позволяет запустить несколько параллельных snapshot requests из нескольких ошибочных сообщений.

### start и stop

[`start()`](../src/client/src/realtime-client.ts#L63) идемпотентно переводит client в active state и вызывает `connect()`.

[`stop()`](../src/client/src/realtime-client.ts#L69):

- запрещает последующий reconnect;
- отменяет pending reconnect timer;
- отвязывает текущий socket от client;
- закрывает socket;
- переводит store connection status в `idle`.

Socket сначала удаляется из `this.socket`, поэтому последующий `onclose` от intentional close не запускает reconnect.

### resume

[`resume()`](../src/client/src/realtime-client.ts#L83) читает cursor непосредственно из store:

```ts
const snapshot = this.store.getSnapshot();
```

Штатное сообщение содержит:

```text
buildingId
streamId
afterSequence
```

`RealtimeClient` не держит отдельную копию cursor, поэтому transport всегда продолжает последнее состояние, реально применённое store.

Ветка `subscribe` без `streamId` оставлена как protocol fallback, но штатный `useRealtimeBootstrap` открывает socket только после snapshot и использует `resume`.

### connect и обработчики socket

[`connect()`](../src/client/src/realtime-client.ts#L102):

1. выставляет `connecting` или `reconnecting`;
2. создаёт socket;
3. на `open` сбрасывает reconnect attempt и вызывает `resume`;
4. на `message` валидирует и маршрутизирует сообщение;
5. на `error` записывает transport error в store;
6. на неожиданном `close` планирует reconnect.

Каждый callback проверяет:

```ts
socket === this.socket && !this.stopped
```

Это не позволяет старому socket изменить состояние после того, как client уже создал новое соединение или остановился.

### Обработка server messages

JSON parsing и `ServerRealtimeMessageSchema` находятся в [`realtime-client.ts:112`](../src/client/src/realtime-client.ts#L112). Невалидное сообщение переводит connection в `error` и закрывает socket.

После валидации:

| Message | Действие client |
|---|---|
| `hello` | проверяет совместимость cursor и ставит `live` |
| `event.batch` | вызывает `store.applyBatch()` |
| `resync.required` | вызывает `resync(snapshotPath)` |
| `heartbeat` | вызывает `store.markHeartbeat()`; при отставании повторяет `resume` |

Ветка находится в [`realtime-client.ts:128`](../src/client/src/realtime-client.ts#L128).

Результат `store.applyBatch()` определяет transport recovery:

```text
applied / duplicate → продолжить
gap                 → HTTP resync
stream-mismatch     → HTTP resync
invalid-state       → HTTP resync
```

Связка вызова и recovery находится в [`realtime-client.ts:134`](../src/client/src/realtime-client.ts#L134).

### Повторное подключение

Неожиданный `close` вызывает [`scheduleReconnect()`](../src/client/src/realtime-client.ts#L165).

Задержки:

```text
250 → 500 → 1000 → 2000 → 4000 → 5000 → 5000 ms
```

Формула:

```ts
Math.min(250 * 2 ** (attempt - 1), 5_000)
```

После успешного `open` counter сбрасывается. Новый socket resume-ится от cursor, который store успел применить до disconnect.

### Полная синхронизация

[`resync()`](../src/client/src/realtime-client.ts#L175):

1. ставит guard `resyncing`;
2. переводит connection в `resyncing`;
3. вызывает injected `loadSnapshot(path)`;
4. передаёт snapshot в `store.replaceSnapshot()`;
5. отправляет `resume` от нового cursor;
6. при ошибке записывает error и закрывает socket, чтобы reconnect повторил recovery lifecycle.

Client не знает, использует loader обычный building snapshot path или путь из `resync.required`.
Guard `resyncing` объединяет несколько одновременных gap/invalid/server resync signals в один
authoritative HTTP request.

## RealtimeHotStore

Исходник: [`src/client/src/realtime-hot-store.ts`](../src/client/src/realtime-hot-store.ts#L65).

### Ответственность

`RealtimeHotStore` отвечает за:

- authoritative client snapshot;
- индексы telemetry/status/alarms/commands;
- stream и sequence invariants;
- per-device revision invariant;
- atomic snapshot replacement;
- immutable-on-change maps для selective subscriptions;
- renderer dirty IDs и versions;
- connection/error state для UI;
- одно subscriber notification на завершённую state transition.

Store не выполняет:

- HTTP или WebSocket I/O;
- retry/backoff;
- timer scheduling;
- React rendering;
- deck.gl layer construction.

### Форма snapshot

`RealtimeHotSnapshot` объявлен в [`realtime-hot-store.ts:28`](../src/client/src/realtime-hot-store.ts#L28).

Данные разделены на четыре группы:

```text
Domain indexes
  telemetryByDeviceId
  statusByDeviceId
  alarmsById
  commandsById

Stream state
  streamId
  sequence

Connection/UI state
  ready
  connectionStatus
  lastMessageAt
  error

Renderer state
  dirtyStatusDeviceIds
  statusVersion
  priorityMembershipVersion
```

`emptySnapshot()` в [`realtime-hot-store.ts:46`](../src/client/src/realtime-hot-store.ts#L46) задаёт безопасное состояние до bootstrap.

### API подписки

Store предоставляет `getSnapshot` и `subscribe` в [`realtime-hot-store.ts:69`](../src/client/src/realtime-hot-store.ts#L69). Это контракт, необходимый `useSyncExternalStore`.

[`publish()`](../src/client/src/realtime-hot-store.ts#L76) сначала заменяет snapshot целиком, затем уведомляет всех listeners. Поэтому subscriber никогда не видит наполовину применённый batch.

### replaceSnapshot

[`replaceSnapshot()`](../src/client/src/realtime-hot-store.ts#L98) используется bootstrap и resync.

Transport arrays индексируются:

```text
telemetry[] → telemetryByDeviceId
telemetry[] → statusByDeviceId
alarms[]    → alarmsById
commands[]  → commandsById
```

Snapshot replacement также:

- заменяет `streamId` и `sequence`;
- устанавливает `ready: true`;
- очищает предыдущую ошибку;
- помечает все device IDs dirty;
- увеличивает status/membership versions; основной layer сохраняет стабильный порядок, а все IDs
  в dirty set обеспечивают полное начальное построение attributes.

Эта операция атомарна: старые hot indexes и старый cursor не смешиваются с новым snapshot.

### Состояние соединения

[`setConnection()`](../src/client/src/realtime-hot-store.ts#L124) меняет только connection/error fields и не создаёт новые domain maps.

[`markHeartbeat()`](../src/client/src/realtime-hot-store.ts#L134) принимает heartbeat только если:

- `streamId` совпадает;
- server latest sequence не опережает локально применённый sequence.

Если server находится впереди, метод возвращает `false`, а client повторяет `resume`.

### applyBatch

[`applyBatch()`](../src/client/src/realtime-hot-store.ts#L146) — основная domain transition.

#### 1. Проверка stream

В [`строках 147–150`](../src/client/src/realtime-hot-store.ts#L147):

- другой stream → `stream-mismatch`;
- `toSequence <= local sequence` → `duplicate`;
- первый свежий event не равен `local sequence + 1` → `gap`.

Если batch частично пересекается с уже применённым cursor, store отбрасывает старую часть и проверяет непрерывность оставшихся events.

#### 2. Копирование при записи

В начале transition новые maps не создаются. Они появляются только для реально изменяемого domain:

```ts
telemetryByDeviceId ??= new Map(currentTelemetry)
statusByDeviceId ??= new Map(currentStatuses)
alarmsById ??= new Map(currentAlarms)
commandsById ??= new Map(currentCommands)
```

Это сохраняет identity неизменившихся indexes. React selector, читающий другой telemetry object или status map, не получает ложное изменение.

#### 3. Patch телеметрии

Ветка начинается в [`realtime-hot-store.ts:162`](../src/client/src/realtime-hot-store.ts#L162).

Алгоритм:

1. найти current telemetry по `deviceId`;
2. неизвестное устройство → `invalid-state`;
3. revision не новее → проигнорировать patch;
4. объединить top-level fields;
5. отдельно объединить `values`;
6. проверить результат `DeviceTelemetrySchema`;
7. записать новый telemetry object в copy-on-write map.

Stale device revision не откатывает данные, но stream sequence после успешной обработки всего contiguous batch всё равно продвигается.

Alarm и command branches сначала требуют известный telemetry `deviceId`. Alarm reconciliation
проверяет immutable identity, `updatedAt` и monotonic lifecycle. Command reconciliation проверяет
immutable request fields, rank `pending < accepted < terminal`, запрещает смену terminal outcome и
разрешает только дополнение `resultTelemetryRevision` к уже executed record. Stale records
пропускаются с продвижением stream cursor; conflict возвращает `invalid-state` без publish всего batch.

#### 4. Status и renderer state

Если status изменился, логика в [`realtime-hot-store.ts:177`](../src/client/src/realtime-hot-store.ts#L177):

- обновляет отдельный `statusByDeviceId`;
- добавляет device ID в `dirtyStatusDeviceIds`;
- увеличивает `statusVersion` при publish;
- сравнивает old/new priority membership через `isPriorityStatus` для счётчиков/версии;
  основной device layer при этом сохраняет стабильный порядок.

`priorityMembershipVersion` увеличивается только при переходе между группами:

```text
normal/offline/unknown ↔ warning/critical
```

Любой status transition основного слоя использует partial dirty ranges; membership version больше
не перегруппировывает большие instance arrays.

#### 5. Upsert аварий и команд

Alarm и command events содержат полные records и записываются по ID. Stage 6 consumers подписываются на `alarmsById`; `DeviceCard` подписывается на `commandsById` и локально выбирает records текущего устройства.

`RealtimeHotStore.upsertAlarm()` дополнительно reconciles schema-valid HTTP acknowledge response. Эта локальная copy-on-write операция меняет только `alarmsById`/`version` и намеренно не меняет `streamId` или `sequence`. Когда серверный `alarm.upsert` приходит через WebSocket, `applyBatch()` идемпотентно записывает тот же record и продвигает общий contiguous cursor. Поэтому UI не ждёт socket round-trip, но transport ordering остаётся единственным владельцем cursor.

`RealtimeHotStore.upsertCommand()` выполняет такой же cursor-neutral reconciliation для HTTP create/lookup response. Lifecycle rank защищает от race, в котором sequenced `accepted` пришёл раньше завершения HTTP request, а response всё ещё содержит `pending`. Conflicting terminal outcomes не заменяют текущий record; ordered stream остаётся владельцем cursor.

#### 6. Атомарная публикация

В [`realtime-hot-store.ts:195`](../src/client/src/realtime-hot-store.ts#L195) store публикует один итоговый snapshot:

- изменённые maps заменяются;
- неизменённые maps сохраняют identity;
- cursor устанавливается в `batch.toSequence`;
- connection становится `live`;
- обновляются timestamps/errors/versions;
- listeners вызываются один раз.

## Совместный жизненный цикл

### Нормальный запуск

```text
useRealtimeBootstrap
  → HTTP snapshot(stream A, sequence 100)
  → store.replaceSnapshot(A, 100)
  → client.start()
  → socket open
  → client.resume(A, after 100)
  ← hello(A)
  ← event.batch(101–124)
  → store.applyBatch
  → store cursor = 124
```

### Краткий disconnect

```text
socket close
  → client scheduleReconnect
  → socket open
  → client reads store cursor 124
  → resume(A, after 124)
  ← replay batch(125–180)
  → store applies batch
```

### Cursor expired или новый server stream

```text
resume(A, after 124)
  ← resync.required(stream B)
  → client.loadSnapshot()
  → store.replaceSnapshot(B, 9000)
  → client.resume(B, after 9000)
```

### Sequence gap внутри live connection

```text
store cursor = 500
client receives batch 503–526
  → store.applyBatch returns gap
  → client.resync()
  → authoritative snapshot replacement
  → resume from recovered cursor
```

## Потребление в React

Store подключается к React через [`useRealtimeSelector`](../src/client/src/use-realtime-state.ts#L7). Consumers выбирают минимальное значение:

| Consumer | Selector |
|---|---|
| [`OperatorToolbar`](../src/client/src/OperatorToolbar.tsx#L28) | `connectionStatus`, `sequence`, active alarm count |
| [`AlarmPanel`](../src/client/src/AlarmPanel.tsx#L26) | `alarmsById`, lifecycle filters/actions |
| [`DeviceCard`](../src/client/src/DeviceCard.tsx#L20) | telemetry и alarms выбранного `deviceId` |
| [`useOperatorWorkspaceModel`](../src/client/src/use-operator-workspace.ts#L13) | status/alarm maps, dirty IDs и renderer versions |

Обычный value-only batch обновляет telemetry map и cursor. Toolbar обновляет sequence; карточка обновляется только если patch относится к выбранному устройству; тяжёлые device layers не пересобираются.

## Инварианты границы классов

- Client никогда не применяет domain patch самостоятельно.
- Store никогда не инициирует network request.
- Cursor хранится только в store; client читает его перед каждым resume.
- Snapshot заменяет indexes и cursor атомарно.
- Unknown-device/conflicting batch отклоняется до единственного publish.
- Одновременные resync triggers выполняют один snapshot request.
- Disconnect command polling не владеет cursor и прекращается после terminal/live.
- Gap не исправляется локальными догадками: store возвращает result, client запускает resync.
- Store notification происходит после полной transition.
- Reconnect не создаёт второй authoritative state.
- Value-only event не меняет renderer status versions.
- Один device update не требует React-render всех consumers.

## Тесты

| Граница | Тест |
|---|---|
| Store snapshot/batch/revision/dirty state | [`realtime-hot-store.test.ts`](../tests/ui/realtime-hot-store.test.ts#L42) |
| Client resume/resync/gap/reconnect | [`realtime-client.test.ts`](../tests/ui/realtime-client.test.ts#L50) |
| Direct bootstrap и selective React render | [`use-realtime-state.test.tsx`](../tests/ui/use-realtime-state.test.tsx#L45) |
| Backend replay/resync WebSocket contract | [`realtime-websocket.test.ts`](../tests/api/realtime-websocket.test.ts#L53) |
