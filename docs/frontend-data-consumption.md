# Frontend data consumption

Внутренняя работа и граница ответственности двух realtime-классов подробно описана в [`realtime-client-and-hot-store.md`](realtime-client-and-hot-store.md).

- Актуально на: 2026-08-09
- Текущий этап: Stage 5 реализован, ожидает приёмки
- Назначение: пошаговое описание пути данных от HTTP/WebSocket до React-компонентов и deck.gl layers.

## Итоговая схема

Frontend потребляет три независимых класса серверных данных:

```text
POST /api/scene/query
        → viewport/zoom geometry
        → FloorScene / BuildingOverview architecture layers

GET /api/v1/catalog
        → TanStack Query
        → stable DeviceMetadata[]
        → filters, positions, labels, picking

GET /api/v1/state/snapshot ──┐
                             ├→ RealtimeHotStore
WS /api/v1/realtime ─────────┘       │
                                     ├→ renderer status selectors
                                     ├→ toolbar cursor selector
                                     └→ selected-device telemetry selector
```

Geometry, stable metadata, hot operational state и UI-only state не объединяются в один transport document или общий frontend store.

## Владельцы данных

| Данные | Владелец на frontend | Причина |
|---|---|---|
| Floors, stable catalog, overview scene bands | TanStack Query | стабильные или повторно используемые серверные документы |
| Authoritative snapshot и live operational state | `RealtimeHotStore` | единый актуальный indexed state без stale query-cache копии |
| Realtime connection, resume, replay и resync | `RealtimeClient` | transport lifecycle не является React server-state query |
| Mode, selected floor/device, search и filters | Zustand `operator-store` | UI-only state |
| Camera, viewport и текущие deck.gl layers | renderer hooks/components | локальное высокочастотное состояние визуализации |

## 1. HTTP-клиенты

[`operator-api.ts:14`](../src/client/src/operator-api.ts#L14) содержит тонкие transport functions:

- [`loadDeviceCatalog(floorIds, signal)`](../src/client/src/operator-api.ts#L14) вызывает `GET /api/v1/catalog`;
- [`loadStateSnapshot(floorIds, signal)`](../src/client/src/operator-api.ts#L26) вызывает `GET /api/v1/state/snapshot` для bootstrap;
- [`loadStateSnapshotPath(path, signal)`](../src/client/src/operator-api.ts#L38) загружает snapshot по пути из `resync.required`.

Каждый JSON-ответ проходит runtime Zod parsing через `CatalogResponseSchema` или `StateSnapshotSchema`. Невалидный payload не попадает в query cache или hot store.

## 2. Stable catalog остаётся в TanStack Query

[`operator-queries.ts:6`](../src/client/src/operator-queries.ts#L6) содержит только `useDeviceCatalogQuery`:

```ts
queryKey: ['device-catalog', scope]
staleTime: 5 * 60_000
```

В floor mode scope содержит выбранный `floorId`; в building overview используется building scope. Pan, zoom и telemetry events не перезапрашивают catalog. `catalog.invalidated` из realtime stream вызывает `invalidateQueries({ queryKey: ['device-catalog'] })`.

Operational snapshot намеренно не имеет TanStack query key. Удалённый `useStateSnapshotQuery` создавал бессрочно кешированную копию, которая устаревала сразу после первого WebSocket batch.

## 3. Workspace определяет catalog scope

[`useOperatorWorkspaceModel`](../src/client/src/use-operator-workspace.ts#L8) читает view mode и выбранный этаж из Zustand; scope и запуск bootstrap находятся в [строках 11–13](../src/client/src/use-operator-workspace.ts#L11):

```ts
const floorIds = state.viewMode === 'floor' && selectedFloor
  ? [selectedFloor.id]
  : undefined;

const catalogQuery = useDeviceCatalogQuery(floorIds, Boolean(selectedFloor));
useRealtimeBootstrap(Boolean(selectedFloor));
```

Scope влияет только на stable catalog. Hot snapshot и realtime cursor остаются building-scoped. Один building sequence нельзя фильтровать по этажу: удалённые из batch события создали бы ложные sequence gaps.

## 4. Прямой snapshot bootstrap

[`useRealtimeBootstrap`](../src/client/src/use-realtime-state.ts#L15) владеет initial lifecycle. Прямой snapshot request и replacement находятся в [строках 27–30](../src/client/src/use-realtime-state.ts#L27), создание клиента — в [строках 32–41](../src/client/src/use-realtime-state.ts#L32), cleanup/abort — в [строках 52–55](../src/client/src/use-realtime-state.ts#L52):

```text
set connection = connecting
        ↓
raw loadStateSnapshot(undefined, AbortSignal)
        ↓
RealtimeHotStore.replaceSnapshot(snapshot)
        ↓
RealtimeClient.start()
```

Snapshot сначала атомарно заполняет hot store, и только затем открывается WebSocket. Cleanup отменяет незавершённый HTTP request через `AbortController` и останавливает созданный client. Это защищает lifecycle при unmount и React Strict Mode.

Если hot store уже готов после remount, повторный snapshot не загружается: новый client resume-ится от сохранённых `streamId` и `sequence`. Если server stream сменился или cursor устарел, штатный WebSocket recovery потребует свежий authoritative snapshot.

## 5. Индексация snapshot

[`RealtimeHotStore.replaceSnapshot()`](../src/client/src/realtime-hot-store.ts#L84) преобразует transport arrays в lookup indexes. Создание telemetry/status maps находится в [строках 85–90](../src/client/src/realtime-hot-store.ts#L85), atomic publish с cursor и renderer versions — в [строках 91–107](../src/client/src/realtime-hot-store.ts#L91):

```text
telemetry[] → Map<deviceId, DeviceTelemetry>
telemetry[] → Map<deviceId, DeviceStatus>
alarms[]    → Map<alarmId, Alarm>
commands[]  → Map<commandId, CommandRecord>
```

Store также сохраняет:

- `streamId` и последний применённый `sequence`;
- `ready`, `connectionStatus`, `lastMessageAt`, `error`;
- `dirtyStatusDeviceIds`;
- `statusVersion`;
- `priorityMembershipVersion` и `priorityMembershipChanged`.

Полная snapshot replacement помечает все statuses dirty и требует безопасного полного построения renderer groups.

## 6. WebSocket resume

[`RealtimeClient`](../src/client/src/realtime-client.ts#L37) строит [same-origin URL `/api/v1/realtime`](../src/client/src/realtime-client.ts#L31), заменяя `http/https` на `ws/wss`. После [`open`](../src/client/src/realtime-client.ts#L107) он вызывает [`resume()`](../src/client/src/realtime-client.ts#L83) и отправляет текущий cursor:

```json
{
  "type": "resume",
  "protocolVersion": "1",
  "buildingId": "west-riverside",
  "streamId": "stage-5-…",
  "afterSequence": 1200
}
```

Сервер отвечает `hello`, при необходимости отдаёт replay и затем продолжает live `event.batch`.

## 7. Проверка и применение batch

Каждое socket message сначала проходит [`ServerRealtimeMessageSchema`](../src/client/src/realtime-client.ts#L112). Ветка `event.batch` и переход к recovery находятся в [строках 134–138](../src/client/src/realtime-client.ts#L134). Для batch [`RealtimeHotStore.applyBatch()`](../src/client/src/realtime-hot-store.ts#L132) проверяет:

1. `streamId` совпадает с локальным stream;
2. batch не является полным duplicate;
3. первый новый event имеет `local sequence + 1`;
4. telemetry patch относится к известному устройству;
5. per-device `revision` новее текущего;
6. объединённый telemetry object проходит `DeviceTelemetrySchema`.

Telemetry patch мержится с текущим объектом, включая [field-level merge `values`](../src/client/src/realtime-hot-store.ts#L153). Stale device revision отбрасывается в [строке 152](../src/client/src/realtime-hot-store.ts#L152), но уже полученный contiguous stream cursor продвигается при [единственном publish batch](../src/client/src/realtime-hot-store.ts#L181). Один batch публикует одно store notification независимо от числа events.

## 8. Recovery

Кратковременный disconnect вызывает [`scheduleReconnect()`](../src/client/src/realtime-client.ts#L158) с [exponential backoff 250–5 000 мс](../src/client/src/realtime-client.ts#L165), после чего client снова отправляет последний cursor. Доступные события приходят из replay.

Следующие ситуации запускают HTTP resync:

- sequence gap;
- другой `streamId`;
- неизвестное локальное устройство или невалидный merged state;
- server message `resync.required` с причиной `cursorExpired`, `streamChanged` или `serverRestart`.

Server `resync.required` обрабатывается в [`realtime-client.ts:143`](../src/client/src/realtime-client.ts#L143), а полный recovery lifecycle реализован в [`resync()`](../src/client/src/realtime-client.ts#L175):

```text
connection = resyncing
        ↓
raw GET authoritative snapshot
        ↓
atomic hot-store replacement
        ↓
resume(new streamId, new sequence)
```

Resync также не записывает snapshot в TanStack Query.

## 9. Selective React subscriptions

[`useRealtimeSelector`](../src/client/src/use-realtime-state.ts#L7) связывает внешний store с React через `useSyncExternalStore`:

```ts
useSyncExternalStore(
  operatorRealtimeStore.subscribe,
  () => selector(operatorRealtimeStore.getSnapshot()),
)
```

Store уведомляет subscribers один раз на batch, но React рендерит consumer только при изменении результата его selector по identity/value.

### Operator toolbar

[`OperatorToolbar`](../src/client/src/OperatorToolbar.tsx#L21) самостоятельно выбирает connection/cursor в [строках 27–28](../src/client/src/OperatorToolbar.tsx#L27) и выводит badge в [строках 107–111](../src/client/src/OperatorToolbar.tsx#L107):

```ts
snapshot.connectionStatus
snapshot.sequence
```

Поэтому дешёвый live badge обновляется с каждым применённым batch, не заставляя тяжёлую сцену потреблять полную telemetry map.

### Selected device card

[`DeviceCard`](../src/client/src/DeviceCard.tsx#L18) вызывает selector в [строке 19](../src/client/src/DeviceCard.tsx#L19):

```ts
useDeviceTelemetry(device.id)
```

Selector возвращает только `telemetryByDeviceId.get(selectedId)`. Update другого устройства сохраняет identity выбранного telemetry object и не рендерит карточку.

### Workspace и renderers

[`useOperatorWorkspaceModel`](../src/client/src/use-operator-workspace.ts#L8) подписан только на renderer-relevant hot state в [строках 14–24](../src/client/src/use-operator-workspace.ts#L14):

- `statusByDeviceId`;
- `dirtyStatusDeviceIds`;
- `statusVersion`;
- `priorityMembershipVersion`;
- `priorityMembershipChanged`;
- readiness/error.

Полная `telemetryByDeviceId` больше не проходит через `OperatorWorkspace`, `FloorScene` или `BuildingOverview` props.

## 10. Filters

Stable `DeviceMetadata[]` из catalog соединяется с `statusByDeviceId` по `deviceId` в чистой [`filterDevices()`](../src/client/src/operator-devices.ts#L21).

Search/type/protocol filters не зависят от telemetry. Status version добавляется в memo dependencies только при активном status filter в [`use-operator-workspace.ts:31`](../src/client/src/use-operator-workspace.ts#L31):

```ts
const statusFilterDependency = state.statusFilter === 'all'
  ? undefined
  : statusVersion;
```

Value-only telemetry batch не пересчитывает filtered devices.

## 11. FloorScene и BuildingOverview

[`OperatorWorkspace`](../src/client/src/OperatorWorkspace.tsx#L11) передаёт renderer-relevant props в [`FloorScene`](../src/client/src/OperatorWorkspace.tsx#L32) или [`BuildingOverview`](../src/client/src/OperatorWorkspace.tsx#L46):

```text
filtered stable devices
status map
dirty status IDs
renderer versions
selected stable device
```

[`FloorScene`](../src/client/src/FloorScene.tsx#L28) делегирует данные в [`useFloorSceneLayers`](../src/client/src/FloorScene.tsx#L46). [`BuildingOverview`](../src/client/src/BuildingOverview.tsx#L82) выполняет тот же pipeline после [добавления floor layout offsets](../src/client/src/BuildingOverview.tsx#L148). В обоих случаях карточка получает только stable `device`: floor card создаётся в [`FloorScene.tsx:94`](../src/client/src/FloorScene.tsx#L94), overview card — в [`BuildingOverview.tsx:356`](../src/client/src/BuildingOverview.tsx#L356), а live telemetry она выбирает самостоятельно.

## 12. Device layers и dirty GPU updates

[`partitionDeviceItems()`](../src/client/src/device-layers.ts#L19) делит instances:

```text
normal layer   = normal · offline · unknown
priority layer = warning · critical
```

Перегруппировка зависит от `priorityMembershipVersion`: floor hook использует его в [`use-floor-scene-layers.ts:47`](../src/client/src/use-floor-scene-layers.ts#L47), overview — в [`BuildingOverview.tsx:153`](../src/client/src/BuildingOverview.tsx#L153). Версия меняется только при переходе между этими группами. Переход `warning → critical` остаётся внутри priority layer и полной перегруппировки не требует.

Для status change внутри текущей группы [`deviceDataRanges()`](../src/client/src/device-layers.ts#L39) преобразует dirty device IDs в минимальные contiguous row ranges. Floor ranges вычисляются в [`use-floor-scene-layers.ts:60`](../src/client/src/use-floor-scene-layers.ts#L60), overview ranges — в [`BuildingOverview.tsx:165`](../src/client/src/BuildingOverview.tsx#L165). [`createDeviceIconLayer()`](../src/client/src/device-layers.ts#L66) передаёт их deck.gl через [`_dataDiff`](../src/client/src/device-layers.ts#L101), поэтому пересчитываются только затронутые color/size attributes.

Если status переводит устройство между normal и priority groups, `priorityMembershipChanged` отключает частичный diff и выполняется безопасное полное обновление обоих instance arrays.

Value-only telemetry batch не меняет status map, dirty set и renderer versions, поэтому device layers сохраняют identity и не пересобираются.

## Основные файлы по ходу данных

| Файл | Роль |
|---|---|
| [`operator-api.ts:14`](../src/client/src/operator-api.ts#L14) | raw catalog/bootstrap/resync HTTP и Zod parsing |
| [`operator-queries.ts:6`](../src/client/src/operator-queries.ts#L6) | только stable catalog query/cache policy |
| [`use-realtime-state.ts:7`](../src/client/src/use-realtime-state.ts#L7) | direct bootstrap lifecycle и React selectors |
| [`realtime-client.ts:37`](../src/client/src/realtime-client.ts#L37) | WebSocket resume/reconnect/recovery |
| [`realtime-hot-store.ts:64`](../src/client/src/realtime-hot-store.ts#L64) | authoritative indexed client state и batch application |
| [`use-operator-workspace.ts:8`](../src/client/src/use-operator-workspace.ts#L8) | catalog scope, status filtering и renderer view model |
| [`OperatorWorkspace.tsx:11`](../src/client/src/OperatorWorkspace.tsx#L11) | распределение renderer-relevant props |
| [`OperatorToolbar.tsx:21`](../src/client/src/OperatorToolbar.tsx#L21) | connection/cursor consumer |
| [`DeviceCard.tsx:18`](../src/client/src/DeviceCard.tsx#L18) | selected-device telemetry consumer |
| [`use-floor-scene-layers.ts:34`](../src/client/src/use-floor-scene-layers.ts#L34) | floor device grouping и dirty ranges |
| [`BuildingOverview.tsx:82`](../src/client/src/BuildingOverview.tsx#L82) | building layout и тот же dirty-layer pipeline |
| [`device-layers.ts:19`](../src/client/src/device-layers.ts#L19) | общий status partition и deck.gl `IconLayer` factory |

## Инварианты

- TanStack Query не владеет актуальной operational telemetry.
- Snapshot всегда заменяет hot indexes и cursor атомарно.
- WebSocket patch не изменяет stable `DeviceMetadata`.
- Один batch вызывает одно store notification.
- Sequence gap никогда не угадывается и требует recovery.
- Value-only update не пересобирает device layers.
- Update одного устройства не рендерит карточку другого устройства.
- Geometry, metadata, hot state и UI state остаются раздельными.
