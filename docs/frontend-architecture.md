# Frontend architecture

Подробный пошаговый путь данных от HTTP/WebSocket до компонентов и deck.gl описан в [`frontend-data-consumption.md`](frontend-data-consumption.md). Взаимодействие `RealtimeClient` и `RealtimeHotStore` разобрано отдельно в [`realtime-client-and-hot-store.md`](realtime-client-and-hot-store.md).

- Актуально на: 2026-08-09
- Текущий этап: Stage 5 реализован, ожидает приёмки
- Назначение: живое описание реализованного frontend; обновляется при каждом этапе и существенном изменении data flow.

## Пользовательский результат

Frontend поддерживает два режима:

- `Floor` — один из восьми этажей West Riverside Hospital;
- `Building` — восемь небольших планов рядом и все 18 000 устройств.

В обоих режимах работают pan, wheel/touch zoom, fit, GPU picking и одна карточка выбранного устройства. Панель оператора переключает этажи, ищет по имени/ID, фильтрует по operational status и показывает состояние realtime-соединения с последним применённым sequence.

## Компонентная схема

```text
QueryClientProvider
└── App
    ├── useQuery(GET /api/floors)
    └── OperatorWorkspace
        ├── useOperatorWorkspaceModel
        │   ├── Zustand: mode, floor, selection, search, filters
        │   ├── useQuery(GET /api/v1/catalog)
        │   ├── raw GET /api/v1/state/snapshot — bootstrap/resync
        │   └── realtime selector: renderer status only
        ├── OperatorToolbar — cursor/connection selector
        └── FloorScene | BuildingOverview
            ├── scene controller / layer hooks
            ├── architecture layers
            │   ├── PolygonLayer
            │   ├── PathLayer
            │   └── TextLayer
            ├── device layers
            │   ├── IconLayer: normal/offline devices
            │   ├── IconLayer: warning/critical devices, rendered last
            │   └── TextLayer: selected/LOD labels
            └── React overlays
                ├── zoom / fit
                ├── diagnostics
                └── one DeviceCard — selected-device telemetry selector
```

## Три независимых потока данных

Frontend не мержит сцену и устройства в единый transport document:

```text
POST /api/scene/query   -> scene.features       -> plan layers
GET  /api/v1/catalog    -> DeviceMetadata[]     -> device positions/icons
GET  /api/v1/state/...  -> authoritative bootstrap/resync
WS   /api/v1/realtime   -> ordered event.batch -> indexed hot state
```

Связи выполняются по `floorId` и `deviceId`. Сцена и устройства визуально совпадают благодаря общей floor-local системе координат, а не потому, что устройства находятся в scene response.

### Архитектурная сцена

`SceneFeature` содержит только `floor-shell`, `zone`, `wall`, `column`, `door`, `window`, `stair` и `label`. В floor mode запрос зависит от viewport и zoom, выполняется с debounce 100 мс, а предыдущий запрос отменяется. В building overview React Query получает по одной полной floor-local сцене на этаж для текущего zoom band и повторно использует кеш между переключениями.

Каждый этаж содержит один базовый `floor-shell`, видимый во всём поддерживаемом zoom. Если успешный scene response всё же пуст, `meta.emptyReason` отличает viewport вне этажа, отсутствие spatial features и LOD filtering. `FloorScene` показывает оператору центральный diagnostic empty-state с подсказкой Fit; `BuildingOverview` выводит количество пустых floor responses в status overlay. Loading и transport error остаются отдельными состояниями.

### Stable device catalog

`DeviceMetadata` содержит имя, тип, протокол, floor-local позицию, provenance, binding и capabilities. Status намеренно отсутствует. React Query кеширует floor-scoped или building-scoped ответ 5 минут; pan/zoom не перезапрашивает каталог.

### Stage 5 realtime hot state

Building-scoped `StateSnapshot` загружается сырым abortable HTTP-запросом прямо из `useRealtimeBootstrap` и сразу заменяет hot store; TanStack Query не хранит копию operational state. После этого `RealtimeClient` открывает WebSocket, отправляет `resume(streamId, afterSequence)` и применяет только непрерывные `event.batch`. Duplicate sequence игнорируется; gap, смена stream и неизвестное локальное состояние запускают такой же прямой HTTP snapshot resync. После disconnect клиент переподключается с exponential backoff 250–5 000 мс и повторно использует последний cursor.

`RealtimeHotStore` — отдельный внешний store, не Zustand и не TanStack Query. Он атомарно заменяет snapshot и хранит индексированные `Map` для telemetry, status, alarms и commands. Один batch публикует одно store notification; per-device revision не даёт позднему patch затереть более новое значение.

```mermaid
flowchart LR
    Catalog["DeviceMetadata[]<br/>id · type · protocol<br/>floorId · position"]
    Snapshot["Authoritative snapshot"]
    Stream["Ordered event.batch"]
    Index["RealtimeHotStore<br/>Map by entity ID"]
    Filter["Search and filters"]
    Layers["deck.gl IconLayers"]
    Card["DeviceCard"]

    Snapshot --> Index
    Stream --> Index
    Catalog --> Filter
    Index --> Filter
    Filter --> Layers
    Catalog --> Card
    Index --> Card
```

Диаграмма подчёркивает, что status не является полем `DeviceMetadata`: stable catalog и hot store соединяются на frontend по `deviceId`.

## Владение состоянием

| Состояние | Владелец | Причина |
|---|---|---|
| Floors, catalog, overview scenes | TanStack Query | стабильные или повторно используемые серверные документы, cache/dedup/stale policy |
| Bootstrap/resync snapshot | `useRealtimeBootstrap` / `RealtimeClient` | прямой abortable HTTP request сразу заменяет hot store; отдельного stale query cache нет |
| Mode, selected floor/device, search, filters | Zustand `operator-store` | общее UI-состояние без prop drilling |
| Camera `viewState`, текущая floor scene | `useFloorScene` / `BuildingOverview` | локальное высокочастотное состояние renderer |
| Indexed hot state и realtime cursor | `RealtimeHotStore` + `useSyncExternalStore` selectors | O(1) lookup и изолированные React subscriptions |
| Filtered device array | `useOperatorWorkspaceModel` memoized selector | один массив данных для GPU layers |

```mermaid
flowchart TD
    User["Operator"]
    Store["Zustand<br/>mode · floor · selection<br/>search · filters"]
    Query["TanStack Query<br/>floors · catalog · overview scenes"]
    Hot["Raw HTTP snapshot + WebSocket<br/>→ RealtimeHotStore"]
    Workspace["useOperatorWorkspaceModel<br/>catalog scope · status filtering"]
    FloorCamera["Floor renderer state<br/>target · zoom · viewport"]
    BuildingCamera["Building renderer state<br/>target · zoom · layout"]
    Floor["FloorScene"]
    Overview["BuildingOverview"]

    User --> Store
    Store --> Workspace
    Query --> Workspace
    Hot --> Workspace
    Workspace -->|floor mode| Floor
    Workspace -->|building mode| Overview
    FloorCamera --> Floor
    BuildingCamera --> Overview
```

Catalog меняет scope между выбранным этажом и зданием. Hot snapshot и realtime cursor остаются building-scoped, чтобы фильтрация событий по этажу не создавала ложных sequence gaps. При смене этажа выбранное устройство сбрасывается. Filters меняют массив instances deck.gl, но не создают DOM-маркер на устройство.

### Точки взаимодействия TanStack Query и Zustand

Библиотеки не обращаются друг к другу напрямую и не дублируют состояние. Их связывают `App` и `useOperatorWorkspaceModel`: Zustand определяет пользовательский scope и локальные преобразования, а TanStack Query возвращает соответствующие серверные документы. `OperatorWorkspace` после рефакторинга только компонует toolbar и нужный renderer по готовой view model.

```text
OperatorToolbar event
        │
        ▼
Zustand: viewMode / selectedFloorId / filters / selectedDeviceId
        │
        ├── viewMode + selectedFloorId -> floorIds -> catalog queryKey
        │                                      │
        │                                      ▼
        │                            catalog data
        │                                      │
        ├── search/type/protocol/status filters┘
        │                    │
        │                    ▼
        │             filteredDevices
        │
        └── selectedDeviceId + catalog data -> selectedDevice
```

| Место | Данные TanStack Query | Состояние Zustand | Результат взаимодействия |
|---|---|---|---|
| `App.tsx` | `floorsQuery.data` | `viewMode`, `selectedFloorId` | выбранный этаж и заголовок приложения |
| `use-operator-workspace.ts`, scope | загруженный список `floors` | `viewMode`, `selectedFloorId` | `floorIds` только для catalog query key; snapshot/realtime остаётся building-scoped |
| `use-operator-workspace.ts`, initialization | первый элемент `floors` | `setSelectedFloorId` | первый загруженный этаж становится выбранным, если выбор ещё не сделан |
| `use-operator-workspace.ts`, filtering | `catalogQuery.data.devices`; status selector из hot store | `search`, type/protocol/status filters | единый `filteredDevices`; status updates пересчитывают его только при активном status filter |
| `use-operator-workspace.ts`, selection | `catalogQuery.data.devices` | `selectedDeviceId` | поиск полного `selectedDevice`; canvas click записывает ID через `setSelectedDeviceId` |
| `OperatorWorkspace.tsx`, composition | готовые `isLoading`/`requestError`/data из view model | `viewMode` внутри view model | loading/error UI и выбор `FloorScene` либо `BuildingOverview` |

Operational snapshot больше не имеет query key: `operator-queries.ts` содержит только `['device-catalog', scope]`, а overview scenes используют `['overview-scene', floorId, zoomBand]`. Search и filters намеренно не входят в query key, потому что это локальные UI-преобразования уже загруженного документа. `selectedDeviceId` также хранится только в Zustand: в серверный кеш попадает устройство, но не пользовательский выбор.

Чистое правило фильтрации находится в `operator-devices.ts`. Хук передаёт ему catalog, status index и текущие Zustand filters, поэтому комбинации search/type/protocol/status тестируются отдельно от React Query и store lifecycle.

На следующих этапах этот раздел обновляется при любом изменении query keys, cache/stale policy, состава Zustand/hot store, правил scope или client-side filtering/selection.

## Floor и building rendering

### FloorScene

- `FloorScene` — тонкая JSX-композиция без загрузки данных и конструирования deck.gl layers в render body;
- `useFloorScene` владеет камерой, auto-fit, debounced/abortable scene query и GPU picking;
- `useFloorSceneLayers` вычисляет LOD labels, делит features по geometry type и создаёт architecture/device layers;
- fit вычисляется из bounds выбранного этажа;
- архитектура запрашивается по реальному bbox камеры;
- отфильтрованные устройства передаются в два instanced `IconLayer`;
- picking ограничен device layer IDs;
- карточка показывается только для устройства текущего этажа.

### BuildingOverview

- этажи раскладываются в сетку 4 колонки на desktop и 2 на mobile;
- floor-local координаты временно смещаются на layout offset;
- архитектура восьми этажей объединяется по типам в общие layers;
- все 18 000 устройств остаются WebGL instances, а не React-компонентами;
- fit охватывает общий layout; pan/zoom и picking используют одну `OrthographicView`.

### Композиция WebGL-слоёв

```mermaid
flowchart TB
    SceneFeatures["scene.features"]
    Devices["filtered devices"]
    Telemetry["status by deviceId"]

    SceneFeatures --> Polygons["PolygonLayer<br/>floor shell · zones"]
    SceneFeatures --> Paths["PathLayer<br/>walls · doors · windows"]
    SceneFeatures --> SceneLabels["TextLayer<br/>plan labels"]

    Devices --> Normal["IconLayer<br/>normal · offline"]
    Devices --> Priority["IconLayer<br/>warning · critical"]
    Telemetry --> Normal
    Telemetry --> Priority
    Devices --> DeviceLabels["TextLayer<br/>selected and LOD labels"]

    Polygons --> Composition["OrthographicView composition"]
    Paths --> Composition
    SceneLabels --> Composition
    Normal --> Composition
    Priority --> Composition
    DeviceLabels --> Composition
```

Порядок слоёв существенен: warning/critical `IconLayer` идёт после обычного device layer, поэтому при визуальном пересечении приоритетные состояния остаются сверху.

Общие для двух renderer правила вынесены из компонентов: `device-layers.ts` индексирует status, делит normal/priority instances и создаёт одинаково настроенный `IconLayer`, а `SceneControls` реализует единые zoom/fit controls. Поэтому floor и overview не расходятся по цветам, размерам, picking-настройкам и шагу zoom.

Value-only telemetry batch не пересобирает device layers: status map, renderer version и instance arrays сохраняют identity. При изменении status hot store публикует `dirtyStatusDeviceIds`; `deviceDataRanges()` объединяет соседние индексы и передаёт их в deck.gl `_dataDiff`, поэтому пересчитываются только затронутые GPU attributes. Если status переводит устройство между normal/offline и warning/critical, меняется membership version и оба слоя безопасно перегруппируются полностью.

## Zoom и LOD

`viewState.zoom` управляет камерой и одновременно влияет на четыре подсистемы:

```text
user input / Fit
       │
       ▼
 viewState.zoom
   ├── camera scale = 2 ** zoom
   ├── visible world bbox
   ├── backend architecture LOD
   ├── device icon size/status emphasis
   └── device label policy
```

Architecture bands:

- `overview`: zoom `< 1.7`;
- `standard`: `1.7 <= zoom < 4.1`;
- `detail`: zoom `>= 4.1`.

Обычная device icon имеет размер 7/10/14 px по диапазонам zoom. Warning — 11/14/17 px, critical — 13/16/19 px. Warning/critical instances выделены в отдельный слой, рисуются поверх остальных и не исчезают из-за renderer LOD. Offline/normal остаются в основном слое.

Подписи ограничены, чтобы не создать визуальный и CPU-шум:

- выбранное устройство подписано всегда;
- warning/critical в floor mode подписываются со среднего приближения;
- обычные подписи появляются только при zoom `>= 5.2`, только внутри viewport и максимум 180 одновременно;
- архитектурные подписи продолжают регулироваться scene LOD.

Пороги, лимит и device layer IDs централизованы в `floor-scene-config.ts`; чистая функция `selectFloorDeviceLabels` в `floor-scene-labels.ts` реализует выбор подписей. Хук слоёв отвечает только за memoization и передачу результата в `TextLayer`.

## Search и filters

Поиск case-insensitive по `device.name` и `device.id`. Type и protocol сравниваются со stable catalog; status — с отдельным hot status map. Фильтры применяются до передачи данных в deck.gl, поэтому counters, status overlay, labels и picking работают с одним и тем же видимым набором.

`Reset` очищает search/type/protocol/status, не меняя mode и выбранный этаж.

## Selection и GPU picking

Клик по canvas вызывает `DeckGLRef.pickObject()` с radius 4 и только с device layer IDs. Возвращённый instance преобразуется в `deviceId`, который хранится в Zustand. React создаёт ровно одну `DeviceCard`; её selector подписан на telemetry object только выбранного `deviceId`, поэтому updates других устройств не вызывают render карточки.

## Основные frontend-файлы

| Файл | Ответственность |
|---|---|
| `src/client/src/App.tsx` | shell, floors query, заголовок режима |
| `src/client/src/OperatorWorkspace.tsx` | декларативная композиция toolbar и выбранного renderer |
| `src/client/src/use-operator-workspace.ts` | catalog scope, status selectors, filters, selection view model |
| `src/client/src/operator-devices.ts` | чистая фильтрация catalog по search/type/protocol/status |
| `src/client/src/operator-store.ts` | UI state на Zustand |
| `src/client/src/operator-api.ts` | catalog, bootstrap и resync clients + Zod parse |
| `src/client/src/operator-queries.ts` | stable catalog React Query key/cache policy |
| `src/client/src/realtime-hot-store.ts` | indexed hot state, sequence/revision checks, dirty renderer state |
| `src/client/src/realtime-client.ts` | WebSocket lifecycle, resume, reconnect и resync |
| `src/client/src/use-realtime-state.ts` | raw abortable snapshot bootstrap, client lifecycle и selective `useSyncExternalStore` subscriptions |
| `src/client/src/OperatorToolbar.tsx` | mode/floor/search/filter controls + live cursor |
| `src/client/src/FloorScene.tsx` | декларативная композиция floor renderer и overlays |
| `src/client/src/use-floor-scene.ts` | camera, fit, scene request lifecycle и GPU picking |
| `src/client/src/use-floor-scene-layers.ts` | floor architecture/device layers и label LOD |
| `src/client/src/floor-scene-config.ts` | layer IDs, debounce и label LOD thresholds/limit |
| `src/client/src/floor-scene-labels.ts` | чистый выбор device labels для текущих zoom и viewport |
| `src/client/src/BuildingOverview.tsx` | layout и rendering всех этажей |
| `src/client/src/DeviceCard.tsx` | selected device metadata + live telemetry selector |
| `src/client/src/SceneControls.tsx` | общие zoom/fit controls двух renderer |
| `src/client/src/device-layers.ts` | общие status partition и фабрика device `IconLayer` |
| `src/client/src/device-visuals.ts` | atlas mapping, status colors, icon LOD |
| `src/client/src/scene-visuals.ts` | scene colors и zoom bands |
| `src/client/src/scene-empty-state.ts` | перевод contract empty reason в операторскую диагностику |
| `src/client/src/viewport.ts` | floor/building fit и bbox conversion |

## Тестовые границы

- Чистые unit-тесты фиксируют status partition, dirty data ranges, поиск и комбинации filters, label zoom thresholds, viewport culling, deduplication и лимит 180.
- Hot-store/client tests фиксируют direct HTTP bootstrap, atomic snapshot replacement, contiguous batches, stale revisions, gaps, resync, reconnect backoff и одно notification на batch.
- Selector component test доказывает, что update другого устройства не рендерит consumer выбранного устройства.
- Hook-тест `useFloorScene` с fake timers фиксирует 100 мс debounce, bbox/zoom request и abort устаревшего запроса при смене камеры.
- Scene contract/API tests фиксируют обязательный base shell и три причины успешного пустого ответа; UI unit-тест фиксирует соответствующие сообщения.
- Chromium E2E проверяет рост live cursor вместе с floor switch, filters, overview, zoom, GPU picking и live device card.

## Ограничения и следующий шаг

- Catalog передаётся целиком для выбранного floor/building scope, а authoritative hot snapshot — для здания; device spatial culling/clustering не добавлялись без benchmark.
- Overview делает до восьми scene queries на новый zoom band; ответы кешируются, но пока не объединены в отдельный backend batch endpoint.
- Главный JS chunk около 1 МБ minified из-за deck.gl; code splitting оставлен как измеряемая оптимизация, а не блокер MVP.
- Browser-level forced disconnect/resync пока покрыт детерминированными client/API tests; Chromium acceptance проверяет штатный live stream.

Stage 6 добавит alarm UI и lifecycle поверх уже реализованных `alarmsById` и `alarm.upsert`, не смешивая аварии с telemetry status.
