# Realtime: передача данных, cursor и восстановление

| Атрибут | Значение |
|---|---|
| Назначение | Вводная страница о realtime-потоке Building Operator MVP |
| Аудитория | Frontend-, backend-разработчики и тестировщики, впервые работающие с решением |
| Формат | Markdown, подготовленный для переноса в Confluence |
| Source of truth | Runtime Zod-схемы в `src/shared` |
| Статус | Описывает текущую реализацию Stage 7 |

## Навигация по комплекту

Эта страница объясняет общую модель и основные термины. Подробности вынесены в связанные документы:

- [Realtime: примеры данных и сообщений](realtime-contract-examples.md) — полные JSON-примеры snapshot, клиентских и серверных сообщений.
- [Realtime: сценарии восстановления](realtime-recovery-playbook.md) — normal flow, reconnect, replay, gap, cursor expiration и server restart.
- [Realtime: карта реализации](realtime-implementation-guide.md) — ответственность файлов, функции, проверки и известные ограничения.
- [RealtimeClient and RealtimeHotStore](realtime-client-and-hot-store.md) — подробное внутреннее устройство двух frontend-классов.
- [ADR-0005](adr/0005-ordered-realtime-with-snapshot-resync.md) — принятое архитектурное решение об ordered batches и HTTP resync.

## Коротко о решении

Realtime состоит из двух дополняющих каналов:

```text
HTTP snapshot                    WebSocket
полное hot-состояние             изменения после snapshot
streamId + sequence              event.batch + heartbeat
авторитетная замена              упорядоченное продвижение cursor
```

Начальное состояние и восстановление загружаются через HTTP. WebSocket не передаёт полную базу при каждом подключении: он передаёт только события после уже известного клиенту `sequence`.

Основной lifecycle:

```text
GET snapshot
  → store.replaceSnapshot()
  → WebSocket open
  → resume(streamId, afterSequence)
  → replay пропущенных событий
  → live events
```

## Какие группы данных существуют

Решение намеренно разделяет данные с разной частотой и ответственностью.

| Группа | Примеры | Канал | Владелец на frontend |
|---|---|---|---|
| Геометрия сцены | планы, bounds, render features | HTTP scene query | scene/rendering state |
| Stable metadata | имя, тип, этаж, capabilities устройства | HTTP catalog | TanStack Query |
| Hot operational state | telemetry, alarms, commands | HTTP snapshot + WebSocket | `RealtimeHotStore` |
| UI-only state | выбранное устройство, фильтры, draft команды | локально | Zustand/React |

Realtime stream не дублирует геометрию и стабильные свойства устройств. Событие `catalog.invalidated` только просит frontend заново загрузить catalog через HTTP.

## Словарь терминов

| Термин | Значение |
|---|---|
| Snapshot | Полное актуальное hot-состояние: telemetry, alarms, commands и realtime cursor |
| Event | Одно доменное изменение: telemetry patch, alarm upsert, command upsert или catalog invalidation |
| Batch | Одно WebSocket-сообщение с одним или несколькими последовательными events |
| Stream | Одна жизнь серверного realtime engine, идентифицируемая `streamId` |
| Cursor | Пара `streamId + sequence`, показывающая позицию клиента в stream |
| Sequence | Глобальный порядковый номер события внутри stream |
| Revision | Версия telemetry конкретного устройства |
| Replay | Сохранённый сервером хвост событий для короткого восстановления |
| Resume | Запрос событий после клиентского cursor |
| Resync | Полная замена client hot-state новым HTTP snapshot |
| Upsert | Полная вставка или замена записи по её ID |
| Patch | Частичное изменение существующей записи |

## Что такое streamId

Пример:

```json
{
  "streamId": "stage-7-550e8400-e29b-41d4-a716-446655440000",
  "sequence": 1042
}
```

`streamId` отвечает на вопрос: «К какой жизни server engine относится этот sequence?»

Число `1042` имеет смысл только вместе с конкретным `streamId`. После перезапуска процесса новый `RealtimeEngine` создаёт новый идентификатор. Поэтому нельзя продолжать старый cursor только по числу.

```text
stream A: 1, 2, 3, ... 1042
server restart
stream B: 1, 2, 3, ...
```

Если клиент хранит `stream A / sequence 1042`, а сервер уже работает со `stream B`, сервер требует полный resync.

## Что такое sequence

`sequence` — глобальный порядковый номер каждого события в одном stream. Его увеличивает только backend в [`RealtimeEngine.publishEvents()`](../src/server/realtime-engine.ts#L185).

```text
sequence 101 → telemetry устройства A
sequence 102 → alarm устройства B
sequence 103 → command устройства C
sequence 104 → telemetry устройства A
```

Sequence не является:

- количеством WebSocket-сообщений;
- версией отдельного устройства;
- timestamp;
- ID сущности.

Один batch может расходовать много sequence:

```json
{
  "type": "event.batch",
  "fromSequence": 101,
  "toSequence": 103,
  "events": [
    { "sequence": 101, "event": { "type": "telemetry.patch" } },
    { "sequence": 102, "event": { "type": "alarm.upsert" } },
    { "sequence": 103, "event": { "type": "command.upsert" } }
  ]
}
```

Фрагмент выше сокращён для объяснения; полные валидные объекты приведены в [примерах контрактов](realtime-contract-examples.md#eventbatch-смешанный-пакет).

### Зачем нужен sequence

Клиент после snapshot с `sequence = 100` ожидает следующее событие с номером `101`.

| Полученный диапазон | Результат | Причина |
|---|---|---|
| `101..124` | применить | непрерывное продолжение |
| `90..100` | duplicate | всё уже применено |
| `98..110` | применить только `101..110` | batch частично пересекает cursor |
| `102..124` | gap | отсутствует событие `101` |

Gap нельзя исправлять догадкой: неизвестное событие могло относиться к telemetry, alarm, command или catalog. Клиент загружает новый snapshot.

## Что такое telemetry revision

`revision` — версия полной telemetry-записи одного устройства. Backend принимает patch только с revision больше текущей revision этого устройства.

```text
device-A: revision 7 → 8 → 9
device-B: revision 40 → 41
```

Revision разных устройств не сравниваются. `device-A/revision 9` не новее и не старее `device-B/revision 41`: это независимые счётчики.

### Sequence и revision одновременно

Предположим, store находится в таком состоянии:

```text
stream sequence = 100
device-A revision = 8
device-B revision = 41
```

Приходит batch:

```text
sequence 101: device-A revision 9
sequence 102: device-B revision 40
sequence 103: alarm.upsert
```

Результат:

| Проверка | Результат |
|---|---|
| `101` идёт после `100` | поток непрерывен |
| `device-A revision 9 > 8` | telemetry A обновляется |
| `device-B revision 40 <= 41` | устаревший patch B игнорируется |
| `103` идёт после `102` | alarm применяется |
| Batch обработан полностью | global sequence становится `103` |

Важно: проигнорированный stale revision не создаёт sequence gap. Событие `102` было доставлено; его данные просто уже не могут улучшить состояние устройства B.

## Snapshot как начальная точка

Контракт [`StateSnapshotSchema`](../src/shared/api-contracts.ts#L33) содержит:

```text
snapshotId
buildingId
streamId
sequence
generatedAt
telemetry[]
alarms[]
commands[]
```

Полный пример: [StateSnapshot](realtime-contract-examples.md#statesnapshot-полное-hot-состояние).

На frontend [`replaceSnapshot()`](../src/client/src/realtime-hot-store.ts#L121):

1. преобразует transport arrays в `Map` по ID;
2. создаёт отдельный status index;
3. заменяет telemetry, alarms и commands одним publish;
4. запоминает `streamId` и `sequence`;
5. выставляет `ready = true`.

Snapshot считается авторитетным. Во время resync старые indexes не дополняются, а заменяются полностью.

## Начальная загрузка

Composition root находится в [`useRealtimeBootstrap()`](../src/client/src/use-realtime-state.ts#L15).

```text
Browser                                      Server
   │                                           │
   ├── GET /api/v1/state/snapshot ────────────►│
   │◄── snapshot(stream A, sequence 100) ──────┤
   │                                           │
   ├── replaceSnapshot(A, 100)                 │
   ├── WebSocket open ────────────────────────►│
   ├── resume(A, afterSequence=100) ──────────►│
   │◄── hello(A, latestSequence=124) ──────────┤
   │◄── event.batch(101..124) ─────────────────┤
   ├── applyBatch(), cursor=124                │
   │◄── следующие live batches ────────────────┤
```

Snapshot загружается до открытия WebSocket. События, созданные между snapshot и `resume`, не теряются: backend возвращает их из replay.

## Как сервер формирует batch

Для telemetry основной путь выглядит так:

```text
DeviceTelemetryPatch[]
  → Zod validation
  → найти текущее устройство
  → отбросить patch с revision <= current revision
  → применить patch к authoritative server state
  → назначить каждому принятому событию sequence
  → сохранить события в replay
  → собрать один event.batch
  → отправить всем WebSocket listeners
```

Текущий simulator по умолчанию формирует до 24 patches каждые 250 мс. Replay содержит последние 5000 событий. Эти параметры определены в [realtime-engine.ts](../src/server/realtime-engine.ts#L34).

Alarm и command передаются как полные records (`upsert`), потому что их объём мал, а lifecycle-поля должны согласованно заменяться вместе. Telemetry передаётся patch-ами, потому что она частая и обычно меняется только один channel/status.

## Как клиент применяет batch

[`RealtimeHotStore.applyBatch()`](../src/client/src/realtime-hot-store.ts#L169) возвращает один из результатов:

| Результат | Значение | Действие клиента |
|---|---|---|
| `applied` | batch применён | продолжать live |
| `duplicate` | все sequence уже применены | ничего не менять |
| `gap` | отсутствует ожидаемый sequence | HTTP resync |
| `stream-mismatch` | другой `streamId` | HTTP resync |
| `invalid-state` | patch нельзя применить к текущему snapshot | HTTP resync |

Применение атомарно на уровне одного batch:

```text
validate cursor
  → создать изменяемые копии только затронутых Map
  → применить все fresh events
  → один publish итогового snapshot
  → один notification всем subscribers
```

Если обработка заканчивается `invalid-state`, промежуточные `Map` не публикуются и cursor не продвигается.

## Краткий disconnect: resume и replay

```text
До разрыва: client cursor = stream A / 124
Во время разрыва: server создаёт events 125..180
После reconnect: client отправляет resume(A, afterSequence=124)
Server отдаёт replay 125..180
Client применяет batch и возвращается в live
```

Reconnect использует exponential backoff от 250 до 5000 мс. Cursor хранится в store, поэтому новый socket продолжает с последнего полностью применённого batch.

Подробный алгоритм: [Короткий disconnect и replay](realtime-recovery-playbook.md#сценарий-2-короткий-disconnect-и-replay).

## Когда нужен resync

Полный snapshot загружается в следующих ситуациях:

| Ситуация | Кто обнаруживает | Причина |
|---|---|---|
| `cursorExpired` | server | нужные события вытеснены из replay |
| `streamChanged` | server | cursor относится к другой жизни engine |
| `serverRestart` | server | client sequence больше server sequence |
| `gap` | client store | batch начинается не со следующего события |
| `invalid-state` | client store | patch невозможно безопасно применить |

```text
problem detected
  → connectionStatus = resyncing
  → GET authoritative snapshot
  → store.replaceSnapshot()
  → resume от cursor нового snapshot
  → replay событий, созданных во время HTTP request
  → live
```

Все recovery-развилки с примерами сообщений находятся в [recovery playbook](realtime-recovery-playbook.md).

## Heartbeat

Каждые 5 секунд server сообщает текущие `streamId` и `latestSequence`.

| Условие | Реакция клиента |
|---|---|
| Stream совпадает, `latestSequence <= local sequence` | отметить соединение как `live` |
| Stream отличается | повторить `resume`, server потребует resync |
| `latestSequence > local sequence` | повторить `resume`, запросить хвост |

Heartbeat не двигает cursor и не содержит доменных данных.

## HTTP mutation и WebSocket event

Alarm acknowledgement и command creation имеют два пути до store:

```text
POST mutation
  ├── HTTP response ──► direct store upsert, sequence не меняется
  └── ordered event ──► WebSocket batch, sequence двигается
```

HTTP response немедленно показывает оператору принятый результат. Только WebSocket event подтверждает позицию этого изменения в общем ordered stream.

Для command direct upsert защищён lifecycle rank: запоздавший HTTP `pending` не может затереть уже полученный по WebSocket `accepted` или terminal state.

## Что смотреть в коде

| Задача | Файл |
|---|---|
| Runtime message schemas | [`src/shared/realtime-contracts.ts`](../src/shared/realtime-contracts.ts) |
| Telemetry, alarm, command schemas | [`src/shared/domain-contracts.ts`](../src/shared/domain-contracts.ts) |
| Snapshot schema | [`src/shared/api-contracts.ts`](../src/shared/api-contracts.ts#L33) |
| Backend state, sequence и replay | [`src/server/realtime-engine.ts`](../src/server/realtime-engine.ts) |
| WebSocket protocol endpoint | [`src/server/realtime-route.ts`](../src/server/realtime-route.ts) |
| Connection/reconnect/resync | [`src/client/src/realtime-client.ts`](../src/client/src/realtime-client.ts) |
| Batch application и indexes | [`src/client/src/realtime-hot-store.ts`](../src/client/src/realtime-hot-store.ts) |
| React bootstrap и selectors | [`src/client/src/use-realtime-state.ts`](../src/client/src/use-realtime-state.ts) |

## Инварианты, которые нельзя нарушать

- `streamId + sequence` всегда рассматриваются вместе.
- Snapshot полностью заменяет hot state и cursor.
- Следующий fresh event должен иметь `local sequence + 1`.
- Sequence назначает только backend.
- Telemetry revision сравнивается только внутри одного `deviceId`.
- Старый revision не откатывает telemetry, но доставленный global sequence считается обработанным.
- Gap не заполняется догадками: выполняется resync.
- Один batch публикуется в store атомарно.
- Stable metadata не встраивается в hot snapshot.
- HTTP mutation response не двигает realtime cursor.

## Связанные архитектурные документы

- [Frontend architecture](frontend-architecture.md)
- [Frontend data consumption](frontend-data-consumption.md)
- [Backend architecture](backend-architecture.md)
- [ADR-0004: separate stable, hot and UI state](adr/0004-separate-stable-hot-ui-state.md)
- [ADR-0005: ordered realtime with snapshot resync](adr/0005-ordered-realtime-with-snapshot-resync.md)
- [Assumptions A-008, A-009 и A-016](assumptions.md#a-008-realtime-ordering)
