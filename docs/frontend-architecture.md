# Frontend architecture

- Актуально на: 2026-08-08
- Текущий этап: Stage 3, готов к приёмке
- Назначение: живое описание реализованного фронтенда; документ обновляется при завершении каждого этапа и при существенном изменении frontend data flow.

## Текущий пользовательский результат

Frontend показывает подготовленный план Level 1 West Riverside Hospital и 2 900 устройств этого этажа. Пользователь может перемещать и масштабировать план, выбирать устройство через GPU picking и открывать одну React-карточку с его стабильными метаданными.

Сейчас реализованы:

- orthographic deck.gl scene;
- pan, wheel/touch zoom и fit;
- серверная фильтрация архитектурной геометрии по viewport и zoom;
- отдельная загрузка stable device metadata по этажу;
- один instanced `IconLayer` для устройств;
- SVG texture atlas из восьми визуальных категорий;
- GPU picking и карточка выбранного устройства;
- runtime-валидация API-ответов через Zod;
- адаптация основных overlay-элементов для мобильной ширины.

## Компонентная схема

```text
App
 ├── GET /api/floors
 └── FloorScene
      ├── POST /api/scene/query
      │    └── архитектурная геометрия по viewport + zoom
      ├── GET /api/v1/catalog
      │    └── stable device metadata выбранного этажа
      ├── DeckGL / OrthographicView
      │    ├── PolygonLayer — архитектурные полигоны
      │    ├── PathLayer    — стены, двери, окна и линии
      │    ├── TextLayer    — подписи сцены
      │    └── IconLayer    — устройства
      └── React overlays
           ├── zoom / fit controls
           ├── diagnostics status
           └── одна карточка выбранного устройства
```

## Граница между сценой и устройствами

Архитектурная сцена и устройства — два независимых набора данных. Устройства не извлекаются из ответа `/api/scene/query`.

### Простая ментальная модель слоёв

```text
Архитектурная сцена
├── PolygonLayer — полигоны и области
├── PathLayer    — стены, двери, окна и другие линии
└── TextLayer    — подписи

Устройства
└── IconLayer    — кликабельные иконки оборудования
```

Первые три слоя строятся из `scene.features`, образуют архитектурную подложку и сейчас не участвуют в picking. `IconLayer` строится отдельно из `catalog.devices`, отображает устройства и является единственным кликабельным слоем текущего этапа.

Название компонента `FloorScene` означает всю визуальную композицию этажа, а не один API-ответ: внутри него архитектурная сцена и device-слой совмещаются визуально, но остаются раздельными наборами данных.

### Scene response

`POST /api/scene/query` возвращает:

- описание этажа;
- источник архитектурной IFC-модели;
- `zoomBand`;
- viewport/zoom-filtered массив `SceneFeature`;
- количество полных и возвращённых архитектурных объектов.

Допустимые `SceneFeature.kind`: `floor-shell`, `zone`, `wall`, `column`, `door`, `window`, `stair`, `label`. Device kind в scene-контракте отсутствует.

Запрос повторяется после pan/zoom с debounce 100 мс. Предыдущий запрос отменяется через `AbortController`.

### Device catalog response

`GET /api/v1/catalog?buildingId=west-riverside&floorIds=<floorId>` возвращает:

- версию каталога;
- building/floor metadata;
- стабильный массив `DeviceMetadata` выбранного этажа;
- координаты `device.position.x/y`;
- тип, протокол, происхождение и capabilities устройства.

Сервер читает эти данные из `data/generated/west-riverside.devices-18000.json.gz`, а не из scene fixture. Для Level 1 возвращается 2 900 устройств. Ответ поддерживает `ETag`, `Cache-Control` и `304`.

Каталог загружается один раз при выборе этажа и не запрашивается повторно при каждом pan/zoom.

### Где они объединяются

Два ответа не сливаются в общий массив. Они встречаются только в `FloorScene.layers`:

```text
scene.features -> PolygonLayer + PathLayer + TextLayer
catalog.devices -> IconLayer
```

Все слои используют одну floor-local систему координат и одну `OrthographicView`, поэтому устройства визуально располагаются поверх архитектуры. Именно общая система координат может создавать впечатление, что устройства пришли из сцены.

## Владение состоянием

### App

`App` загружает список этажей, выбирает первый и передаёт его в `FloorScene`. Переключение этажей пока не реализовано.

### FloorScene

Компонент хранит:

- `viewState` — target, zoom и ограничения камеры;
- `scene` — текущую viewport/zoom-выборку архитектуры;
- `devices` — stable metadata устройств этажа;
- `selectedDevice` — выбранное устройство;
- отдельные scene/device errors;
- признак обновления scene request.

Пока используются стандартные React `useState`, `useEffect`, `useMemo` и `useRef`. Query cache, Zustand и отдельный hot telemetry store ещё не подключены.

## Zoom data flow и влияние на UI

`viewState.zoom` — общий источник масштаба для камеры, backend scene query, архитектурного LOD, размера device-иконок и diagnostics UI.

```text
wheel / pinch / double click / + / − / Fit
                    │
                    ▼
             viewState.zoom
                    │
       ┌────────────┼──────────────┐
       │            │              │
       ▼            ▼              ▼
DeckGL camera   viewStateToBBox   IconLayer size
                    │              7 / 10 / 14 px
                    ▼
          POST /api/scene/query
             zoom + viewport
                    │
                    ▼
       server zoom band + feature LOD
                    │
                    ▼
  PolygonLayer / PathLayer / TextLayer data

Diagnostics status показывает zoom, zoom band и число features.
```

### Источники изменения zoom

- Wheel/trackpad, pinch и double click обрабатываются deck.gl controller.
- Кнопки `+` и `−` изменяют zoom на `0.35` и ограничивают его `minZoom/maxZoom`.
- `Fit` вычисляет zoom из размеров контейнера и bounds этажа: выбирается минимальный scale по ширине/высоте с коэффициентом поля `0.86`, затем применяется `Math.log2(scale)`.
- Допустимый frontend-диапазон сейчас `-1..7`.

В `OrthographicView` scale равен `2 ** zoom`: увеличение zoom на `1` удваивает экранный размер одной мировой единицы.

### Камера и viewport bbox

DeckGL сразу использует zoom для визуального масштаба. Одновременно `viewStateToBBox()` переводит zoom и размеры canvas в видимую область мировых координат:

```text
scale      = 2 ** zoom
halfWidth  = canvasWidth  / (2 * scale)
halfHeight = canvasHeight / (2 * scale)
```

При увеличении zoom bbox сужается, при уменьшении — расширяется. Поэтому backend получает не только значение zoom, но и новую видимую область.

### Архитектурный LOD

После изменения zoom scene effect с debounce 100 мс вызывает `/api/scene/query`. Backend:

- оставляет features, пересекающие новый bbox;
- оставляет features, для которых `minZoom <= zoom <= maxZoom`;
- назначает `overview` при zoom `< 1.7`;
- назначает `standard` при `1.7 <= zoom < 4.1`;
- назначает `detail` при zoom `>= 4.1`.

Новый `scene.features` меняет данные `PolygonLayer`, `PathLayer` и `TextLayer`. Поэтому при приближении могут появляться двери, окна, подписи и другая detail-геометрия, а diagnostics показывает другое число features.

### Размер device-иконок

Zoom не вызывает повторную загрузку catalog и не меняет количество устройств. Все devices текущего этажа остаются в `IconLayer`, но их экранный размер меняется ступенчато:

- zoom `< 2.8` — 7 px;
- `2.8 <= zoom < 4.1` — 10 px;
- zoom `>= 4.1` — 14 px.

Размер задаётся в `pixels`, поэтому внутри каждого диапазона иконка сохраняет постоянный экранный размер, хотя расстояние между устройствами растёт вместе с масштабом камеры. GPU picking, selected device, цвет и карточка не сбрасываются при zoom.

### Diagnostics и loading state

Status overlay выводит:

- серверный `scene.zoomBand`;
- returned/total feature count;
- неизменное число загруженных devices;
- `viewState.zoom` с двумя знаками;
- `updating`, пока выполняется новый scene request.

Быстрые последовательные изменения zoom отменяют устаревший scene request через `AbortController`. Catalog request от zoom не зависит.

## WebGL rendering

### Архитектурные слои

- `PolygonLayer` отображает polygon features.
- `PathLayer` отображает path features.
- `TextLayer` отображает point labels.
- Архитектурные слои сейчас `pickable: false`, так как для них нет пользовательского сценария выбора.

### Device layer

Все устройства этажа передаются в один `IconLayer<DeviceMetadata>`. Это instanced WebGL rendering: React не создаёт DOM/JSX-элемент и обработчик для каждого устройства.

Типы устройств преобразуются в восемь atlas-категорий: `light`, `sensor`, `fire`, `hvac`, `control`, `access`, `meter`, `other`. Цвет задаётся категорией. Operational status пока отсутствует.

Размер иконки зависит от zoom:

- overview — 7 px;
- standard — 10 px;
- detail — 14 px.

## Selection и GPU picking

Клик по canvas вызывает `DeckGLRef.pickObject()`:

- поиск ограничен `layerIds: ['floor-devices']`;
- используется pick radius 4 px;
- результатом является исходный `DeviceMetadata`;
- выбранный instance подсвечивается;
- React создаёт одну карточку выбранного устройства.

Карточка показывает name, type, protocol, data origin, floor-local position, число telemetry channels, число command capabilities и ID.

## Основные frontend-файлы

| Файл | Ответственность |
|---|---|
| `src/client/src/App.tsx` | Application shell и начальный этаж |
| `src/client/src/FloorScene.tsx` | Запросы сцены/устройств, controlled view state, слои, picking, карточка |
| `src/client/src/scene-api.ts` | Floors и viewport scene API client |
| `src/client/src/device-api.ts` | Stable catalog API client |
| `src/client/src/viewport.ts` | Fit и преобразование view state в bbox |
| `src/client/src/use-element-size.ts` | Размер контейнера сцены |
| `src/client/public/device-atlas.svg` | Texture atlas устройств |
| `src/client/src/styles.css` | Shell, overlays, карточка и mobile styles |
| `src/shared/scene-contracts.ts` | Scene runtime contracts |
| `src/shared/domain-contracts.ts` | Device metadata runtime contracts |

## Текущие ограничения и следующий архитектурный шаг

- Показывается только первый этаж.
- Нет building overview, поиска и фильтров.
- Все устройства этажа загружаются целиком; device viewport culling пока не нужен и не реализован.
- Цвет отражает категорию, а не telemetry/alarm status.
- Realtime, hot store и dirty GPU attribute updates не реализованы.
- Level 1 catalog response содержит полные stable metadata и занимает около 2,18 МБ до HTTP content encoding.
- `FloorScene` пока совмещает data loading, layer construction и overlays. Перед дальнейшим ростом его следует разделить на hooks/data adapters, layer factory и самостоятельные UI-компоненты.

Stage 4 добавит переключение этажей, building overview, поиск/фильтры и дальнейший LOD. Stage 5 добавит realtime transport и отдельное индексированное hot state, не смешивая его со stable catalog.
