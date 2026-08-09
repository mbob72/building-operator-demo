# Frontend data consumption

Внутренняя работа и граница ответственности двух realtime-классов подробно описана в [`realtime-client-and-hot-store.md`](realtime-client-and-hot-store.md).

- Актуально на: 2026-08-10
- Текущий статус: Stage 7 завершён и принят; Stage 8 не начат
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
        → filters, positions, hover/click picking

GET /api/v1/state/snapshot ──┐
                             ├→ RealtimeHotStore
WS /api/v1/realtime ─────────┘       │
                                     ├→ renderer status selectors
                                     ├→ toolbar cursor selector
                                     ├→ selected-device telemetry/alarm selectors
                                     ├→ selected-device command selector
                                     └→ AlarmPanel + alarm plan layer

POST /api/v1/alarms/:id/acknowledge
        → validated Alarm response
        → hot-store reconciliation (cursor unchanged)

POST /api/v1/commands
        → validated pending CommandRecord
        → hot-store reconciliation (cursor unchanged)
        ← later sequenced command.upsert lifecycle
```

Geometry, stable metadata, hot operational state и UI-only state не объединяются в один transport document или общий frontend store.

## Владельцы данных

| Данные | Владелец на frontend | Причина |
|---|---|---|
| Floors, stable catalog, overview scene bands | TanStack Query | стабильные или повторно используемые серверные документы |
| Authoritative snapshot и live operational state | `RealtimeHotStore` | единый актуальный indexed state без stale query-cache копии |
| Realtime connection, resume, replay и resync | `RealtimeClient` | transport lifecycle не является React server-state query |
| Mode, selected floor/device, search/device/alarm filters, panel state и command draft | Zustand `operator-store` | UI-only state |
| Camera, viewport и текущие deck.gl layers | renderer hooks/components | локальное высокочастотное состояние визуализации |

## 1. HTTP-клиенты

[`operator-api.ts:16`](../src/client/src/operator-api.ts#L16) содержит тонкие transport functions:

- [`loadDeviceCatalog(floorIds, signal)`](../src/client/src/operator-api.ts#L16) вызывает `GET /api/v1/catalog`;
- [`loadStateSnapshot(floorIds, signal)`](../src/client/src/operator-api.ts#L28) вызывает `GET /api/v1/state/snapshot` для bootstrap;
- [`loadStateSnapshotPath(path, signal)`](../src/client/src/operator-api.ts#L40) загружает snapshot по пути из `resync.required`.
- [`acknowledgeAlarm(alarmId, request)`](../src/client/src/operator-api.ts) вызывает mutation endpoint и валидирует `AcknowledgeAlarmResponse`.
- [`createCommand(request)`](../src/client/src/operator-api.ts) отправляет idempotent mutation и валидирует `CreateCommandResponse`;
- [`loadCommand(commandId)`](../src/client/src/operator-api.ts) предоставляет GET fallback для Stage 8 disconnect handling.

Каждый JSON-ответ проходит runtime Zod parsing через `CatalogResponseSchema` или `StateSnapshotSchema`. Невалидный payload не попадает в query cache или hot store.

## 2. Stable catalog остаётся в TanStack Query

[`operator-queries.ts:6`](../src/client/src/operator-queries.ts#L6) содержит только `useDeviceCatalogQuery`:

```ts
queryKey: ['device-catalog', scope]
staleTime: 5 * 60_000
```

Stage 7 использует building scope в обоих режимах. Выбранный floor вычисляется локально, поэтому alarm navigation не ждёт metadata request. Pan, zoom, telemetry, alarm и command events не перезапрашивают catalog. `catalog.invalidated` из realtime stream вызывает `invalidateQueries({ queryKey: ['device-catalog'] })`.

Operational snapshot намеренно не имеет TanStack query key. Удалённый `useStateSnapshotQuery` создавал бессрочно кешированную копию, которая устаревала сразу после первого WebSocket batch.

## 3. Workspace определяет локальный floor scope

[`useOperatorWorkspaceModel`](../src/client/src/use-operator-workspace.ts) читает view mode и выбранный этаж из Zustand, загружает building catalog один раз и локально выбирает floor devices:

```ts
const catalogQuery = useDeviceCatalogQuery(undefined, Boolean(selectedFloor));
useRealtimeBootstrap(Boolean(selectedFloor));
```

`catalogDevices` остаётся полным для building-wide alarm lookup, а `devices` зависит от `viewMode/selectedFloor`. Hot snapshot и realtime cursor также building-scoped. Один building sequence нельзя фильтровать по этажу: удалённые из batch события создали бы ложные sequence gaps.

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

[`RealtimeHotStore.replaceSnapshot()`](../src/client/src/realtime-hot-store.ts#L98) преобразует transport arrays в lookup indexes. Создание telemetry/status maps начинается в [строке 99](../src/client/src/realtime-hot-store.ts#L99), atomic publish с cursor и renderer versions — в [строке 105](../src/client/src/realtime-hot-store.ts#L105):

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
  "streamId": "stage-7-…",
  "afterSequence": 1200
}
```

Сервер отвечает `hello`, при необходимости отдаёт replay и затем продолжает live `event.batch`.

## 7. Проверка и применение batch

Каждое socket message сначала проходит [`ServerRealtimeMessageSchema`](../src/client/src/realtime-client.ts#L112). Ветка `event.batch` и переход к recovery находятся в [строках 134–138](../src/client/src/realtime-client.ts#L134). Для batch [`RealtimeHotStore.applyBatch()`](../src/client/src/realtime-hot-store.ts#L146) проверяет:

1. `streamId` совпадает с локальным stream;
2. batch не является полным duplicate;
3. первый новый event имеет `local sequence + 1`;
4. telemetry patch относится к известному устройству;
5. per-device `revision` новее текущего;
6. объединённый telemetry object проходит `DeviceTelemetrySchema`.

Telemetry patch мержится с текущим объектом, включая [field-level merge `values`](../src/client/src/realtime-hot-store.ts#L170). Stale device revision отбрасывается в [строке 166](../src/client/src/realtime-hot-store.ts#L166), но уже полученный contiguous stream cursor продвигается при [единственном publish batch](../src/client/src/realtime-hot-store.ts#L195). Один batch публикует одно store notification независимо от числа events.

## 8. Alarm lifecycle consumption

Snapshot indexing and `alarm.upsert` both replace a complete record in `alarmsById`. [`AlarmPanel`](../src/client/src/AlarmPanel.tsx) subscribes to this map and `statusByDeviceId`, а [`alarm-model.ts`](../src/client/src/alarm-model.ts) чисто выполняет severity/state filtering, operational sorting, counts и выбор strongest unresolved alarm per device. Для каждой строки `deviceId` связывает alarm со stable `DeviceMetadata` из building catalog; [`DeviceVisualMarkers`](../src/client/src/DeviceVisualMarkers.tsx) показывает type icon и protocol badge из metadata, а status square — из актуального hot-state index. Alarm severity/state визуально и семантически не заменяют telemetry status.

При `Acknowledge` transport client получает schema-valid Alarm и вызывает [`RealtimeHotStore.upsertAlarm()`](../src/client/src/realtime-hot-store.ts). Это немедленно показывает accepted author/time, но сохраняет realtime `sequence`: только ordered `alarm.upsert` из socket двигает cursor. Если socket event пришёл раньше HTTP response, повторная запись того же полного record ничего не меняет.

Renderer получает полный scoped список устройств отдельно от `filteredDevices`. [`alarm-layers.ts`](../src/client/src/alarm-layers.ts) создаёт один `ScatterplotLayer` unresolved contours; resolved records остаются в списке/карточке, но не на плане. `Locate` соединяет alarm `deviceId` с building catalog и атомарно обновляет Zustand floor/selection. Выбранная [`DeviceCard`](../src/client/src/DeviceCard.tsx) использует тот же marker strip, но status получает из своего точечного telemetry selector.

## 9. Command lifecycle consumption

`DeviceCard` выбирает только commands текущего `deviceId` из `commandsById`. [`CommandControls`](../src/client/src/CommandControls.tsx) строит UI-only `CommandDraft` из stable capability и хранит его в Zustand; backend никогда не получает или не возвращает state `draft`.

Submission выполняется напрямую или после explicit confirmation dialog. Schema-valid REST response reconciles через `upsertCommand()` без изменения cursor. Если ordered `accepted` уже пришёл раньше более медленного HTTP `pending`, lifecycle rank сохраняет более новый record. Последующие complete `command.upsert` применяются обычным batch path.

В command form/history три значения не мержатся:

```text
desired intent     ← Zustand draft / immutable CommandRecord.intent
backend lifecycle ← commandsById
actual telemetry  ← telemetryByDeviceId
```

Поэтому `executed` не подменяет actual value. В Stage 7 simulator позже публикует отдельный revisioned telemetry patch для успешной команды, после которого selector обновляет `Actual`; failed/timedOut records не вызывают такого события. Setpoint input получает range/step из capability, а server повторно валидирует их независимо от HTML controls.

## 10. Recovery

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

## 10. Selective React subscriptions

[`useRealtimeSelector`](../src/client/src/use-realtime-state.ts#L7) связывает внешний store с React через `useSyncExternalStore`:

```ts
useSyncExternalStore(
  operatorRealtimeStore.subscribe,
  () => selector(operatorRealtimeStore.getSnapshot()),
)
```

Store уведомляет subscribers один раз на batch, но React рендерит consumer только при изменении результата его selector по identity/value.

### Operator toolbar

[`OperatorToolbar`](../src/client/src/OperatorToolbar.tsx#L22) самостоятельно выбирает connection/cursor/alarm map в [строках 28–31](../src/client/src/OperatorToolbar.tsx#L28) и выводит badge в [строке 116](../src/client/src/OperatorToolbar.tsx#L116):

```ts
snapshot.connectionStatus
snapshot.sequence
```

Connection/cursor badge обновляется с каждым применённым batch. Отдельный selector `alarmsById` обновляет active alarm counter только при alarm changes.

### Selected device card

[`DeviceCard`](../src/client/src/DeviceCard.tsx#L20) вызывает telemetry и alarm selectors в [строках 21–22](../src/client/src/DeviceCard.tsx#L21):

```ts
useDeviceTelemetry(device.id)
```

Telemetry selector возвращает только `telemetryByDeviceId.get(selectedId)`. Карточка отдельно фильтрует low-volume `alarmsById` для выбранного device; telemetry update другого устройства сохраняет identity выбранного telemetry object.

### Workspace и renderers

[`useOperatorWorkspaceModel`](../src/client/src/use-operator-workspace.ts#L8) подписан только на renderer-relevant hot state в [строках 13–24](../src/client/src/use-operator-workspace.ts#L13):

- `statusByDeviceId`;
- `dirtyStatusDeviceIds`;
- `statusVersion`;
- `priorityMembershipVersion`;
- `priorityMembershipChanged`;
- readiness/error.
- `alarmsById` для alarm overlay.

Полная `telemetryByDeviceId` больше не проходит через `OperatorWorkspace`, `FloorScene` или `BuildingOverview` props.

## 11. Filters

Stable `DeviceMetadata[]` из catalog соединяется с `statusByDeviceId` по `deviceId` в чистой [`filterDevices()`](../src/client/src/operator-devices.ts#L21).

Search/type/protocol filters не зависят от telemetry. Zustand хранит три массива выбранных contract values. Status version добавляется в memo dependencies только когда выбраны не все statuses в [`use-operator-workspace.ts:37`](../src/client/src/use-operator-workspace.ts#L37):

```ts
const statusFilterDependency = state.statusFilters.length === DeviceStatusSchema.options.length
  ? undefined
  : statusVersion;
```

Внутри type/protocol/status массива действует OR, между тремя массивами и search — AND. Master-checkbox управляет полным contract option set и показывает `indeterminate`, когда выбран неполный непустой subset. Value-only telemetry batch не пересчитывает filtered devices.

## 12. FloorScene и BuildingOverview

[`OperatorWorkspace`](../src/client/src/OperatorWorkspace.tsx#L11) передаёт renderer-relevant props в [`FloorScene`](../src/client/src/OperatorWorkspace.tsx#L32) или [`BuildingOverview`](../src/client/src/OperatorWorkspace.tsx#L46):

```text
filtered stable devices
status map
dirty status IDs
renderer versions
selected stable device
unfiltered scoped devices + alarms map for alarm contours
```

[`FloorScene`](../src/client/src/FloorScene.tsx) делегирует данные в `useFloorSceneLayers`. [`BuildingOverview`](../src/client/src/BuildingOverview.tsx) выполняет тот же pipeline после добавления floor layout offsets. В обоих случаях карточка получает stable `device`, а live telemetry/alarms выбирает самостоятельно.

Type glyph также следует stable metadata без промежуточного component mapping. [`device-visuals.ts`](../src/client/src/device-visuals.ts) берёт порядок непосредственно из `DeviceTypeSchema.options`, выделяет каждому из 19 типов уникальный SVG-atlas slot и отдаёт тот же key в deck.gl `getIcon`. [`DeviceVisualMarkers`](../src/client/src/DeviceVisualMarkers.tsx) вычисляет CSS background position по этому же порядку, поэтому filter row, alarm row, selected card и карта показывают один glyph для одного `device.type`.

## 13. Device и alarm layers

[`partitionDeviceItems()`](../src/client/src/device-layers.ts#L19) делит instances:

```text
normal layer   = normal · offline · unknown
priority layer = warning · critical
```

Перегруппировка зависит от `priorityMembershipVersion`: floor hook использует его в [`use-floor-scene-layers.ts:47`](../src/client/src/use-floor-scene-layers.ts#L47), overview — в [`BuildingOverview.tsx:153`](../src/client/src/BuildingOverview.tsx#L153). Версия меняется только при переходе между этими группами. Переход `warning → critical` остаётся внутри priority layer и полной перегруппировки не требует.

Для status change внутри текущей группы [`deviceDataRanges()`](../src/client/src/device-layers.ts#L39) преобразует dirty device IDs в минимальные contiguous row ranges. Floor ranges вычисляются в [`use-floor-scene-layers.ts:60`](../src/client/src/use-floor-scene-layers.ts#L60), overview ranges — в [`BuildingOverview.tsx:165`](../src/client/src/BuildingOverview.tsx#L165). [`createDeviceIconLayer()`](../src/client/src/device-layers.ts#L66) передаёт их deck.gl через [`_dataDiff`](../src/client/src/device-layers.ts#L101), поэтому пересчитываются только затронутые color/size attributes.

Если status переводит устройство между normal и priority groups, `priorityMembershipChanged` отключает частичный diff и выполняется безопасное полное обновление обоих instance arrays.

Value-only telemetry batch не меняет status map, dirty set и renderer versions, поэтому device layers сохраняют identity и не пересобираются.

Alarm volume мал и обновляется существенно реже telemetry, поэтому alarm contour layer пересобирает только свой небольшой data array при смене `alarmsById`. Он не участвует в device dirty-range optimization и не создаёт DOM node на alarm/device.

## Основные файлы по ходу данных

| Файл | Роль |
|---|---|
| [`operator-api.ts`](../src/client/src/operator-api.ts) | raw catalog/bootstrap/resync/acknowledge HTTP и Zod parsing |
| [`operator-queries.ts:6`](../src/client/src/operator-queries.ts#L6) | только stable catalog query/cache policy |
| [`use-realtime-state.ts:7`](../src/client/src/use-realtime-state.ts#L7) | direct bootstrap lifecycle и React selectors |
| [`realtime-client.ts:37`](../src/client/src/realtime-client.ts#L37) | WebSocket resume/reconnect/recovery |
| [`realtime-hot-store.ts:65`](../src/client/src/realtime-hot-store.ts#L65) | authoritative indexed client state и batch application |
| [`use-operator-workspace.ts`](../src/client/src/use-operator-workspace.ts) | building catalog, local floor/status filtering и renderer view model |
| [`OperatorWorkspace.tsx:11`](../src/client/src/OperatorWorkspace.tsx#L11) | распределение renderer-relevant props |
| [`OperatorToolbar.tsx`](../src/client/src/OperatorToolbar.tsx) | connection/cursor и active alarm count consumer |
| [`OperatorFilterRows.tsx`](../src/client/src/OperatorFilterRows.tsx) | checkbox multi-select UI и tri-state master controls |
| [`AlarmPanel.tsx`](../src/client/src/AlarmPanel.tsx) | alarm filters, acknowledge и locate workflow |
| [`alarm-model.ts`](../src/client/src/alarm-model.ts) | pure alarm selectors |
| [`alarm-layers.ts`](../src/client/src/alarm-layers.ts) | plan contour layer factory |
| [`SceneDeviceTooltip.tsx`](../src/client/src/SceneDeviceTooltip.tsx) | единственный hover-tooltip выбранного deck.gl instance |
| [`selection-layers.ts`](../src/client/src/selection-layers.ts) | фиксированный selection halo двух renderer |
| [`DeviceCard.tsx`](../src/client/src/DeviceCard.tsx) | selected-device telemetry/alarm consumer |
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
- HTTP acknowledgement не двигает realtime cursor; socket event двигает его ровно один раз.
- Resolved alarm не рисуется на плане, но сохраняется в списке и audit view.
- Device filters не скрывают unresolved alarm contour.
- Geometry, metadata, hot state и UI state остаются раздельными.
