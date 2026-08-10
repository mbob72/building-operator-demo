# Building Operator MVP — журнал этапов

## Текущий статус

- Текущий статус: **объединённые этапы 10–11 завершены и приняты; MVP завершён**.
- Этапы 0–7 завершены и приняты.
- Разработка ведётся последовательно одним coding agent.
- Переход между этапами выполняется только после явного апрува пользователя.
- Количество устройств не является строгой константой `20 000`: нужен репрезентативный набор порядка десятков тысяч, без ухода в игрушечный масштаб около 2 000 или избыточный масштаб около 200 000.
- Для performance-проверки предусмотрен отдельный fixture на 50 000 устройств.
- Публичный live-demo опубликован: `https://building-operator-demo.onrender.com`.

## Этапы разработки

### Этап 0. Viewport-aware сцена реального этажа — завершён

Цель: доказать, что backend может отдавать подготовленную 2D-сцену с учётом этажа, viewport и zoom, а frontend — плавно отображать её с pan/zoom без загрузки IFC в браузер.

Результат этапа подробно описан ниже.

### Этап 1. Продуктовая модель и доменные контракты — завершён

- Уточнить операторские сценарии и границы MVP.
- Зафиксировать сущности здания, этажа, устройства, телеметрии, аварии и команды.
- Определить REST, realtime, snapshot и resync-контракты.
- Разделить стабильные метаданные, горячую телеметрию и UI-состояние.
- Дополнить JSON Schema и ADR.

Результат этапа описан в `reports/stage-one.md`.

### Этап 2. Полный offline data pipeline — завершён

- Извлечь необходимые этажи West Riverside Hospital.
- Подготовить уровни детализации архитектурной геометрии.
- Исследовать инженерные IFC-дисциплины и реальные координаты подходящих элементов.
- Сгенерировать недостающие устройства с фиксированным seed.
- Подготовить репрезентативный набор порядка десятков тысяч устройств.
- Явно маркировать `dataOrigin: ifc | derived | synthetic`.
- Сформировать отчёт о качестве данных и воспроизводимости.

### Этап 3. Минимальный device vertical slice — завершён

- Загрузить стабильные метаданные устройств.
- Показать устройства одного этажа через deck.gl `IconLayer`.
- Добавить texture atlas, instanced rendering и GPU picking.
- Открывать карточку выбранного устройства.
- Не создавать React/DOM-компонент для каждого устройства.

### Этап 4. Floor mode и building overview — завершён и принят

- Переключение этажей.
- Overview всех этажей и устройств.
- Zoom, pan, fit и picking.
- Уровни детализации плана и подписей.
- Поиск и фильтры по типу, протоколу и состоянию.
- Сохранение видимости warning/critical состояний при любом LOD.

Реализованы восемь floor scenes, floor/building режимы, полный обзор 18 000 устройств, раздельный deterministic status snapshot, search/type/protocol/status filters, GPU picking и device/label LOD. После приёмки добавлена гарантированная base geometry и explicit empty-scene diagnostics. Полный отчёт: `reports/stage-four.md`.

### Этап 5. Realtime transport и hot telemetry store — завершён и принят

- WebSocket abstraction и mock simulator.
- Нормальная нагрузка и burst-сценарии.
- Разрыв соединения, reconnect и snapshot/resync.
- Индексированное хранение состояния по `deviceId`.
- Coalescing повторных событий и пакетное обновление dirty GPU-атрибутов.
- Отсутствие React-render на каждое realtime-сообщение.

Реализованы authoritative mutable snapshot, building-scoped WebSocket stream, contiguous sequence,
replay window, heartbeat, reconnect/resume и HTTP resync. Hot state индексирован отдельно от TanStack
Query и Zustand; selector subscriptions изолируют toolbar, выбранную карточку и renderer status.
Value-only batches не пересобирают device layer, а status changes используют dirty deck.gl ranges
стабильного массива. Отчёт: `reports/stage-five.md`.

### Этап 6. Аварии — завершён и принят

- Warning и critical alarm на плане.
- Состояния `active`, `acknowledged`, `resolved`.
- Список и фильтрация аварий.
- Переход к аварийному устройству.
- Acknowledge с автором и временем.

Реализованы deterministic warning/critical alarm fixtures на восьми этажах, монотонный lifecycle `active → acknowledged → resolved`, idempotent acknowledge REST mutation и `alarm.upsert` в общем realtime stream. Frontend получил building-wide alarm panel, severity/state filters, active counter, переход к устройству, audit author/time, карточку alarms и отдельный instanced plan contour, независимый от telemetry status и device filters. После UX-корректировок `Alarms` стоит первым, device filters представлены тремя multi-select checkbox-рядами с tri-state master controls, а scene использует единственный hover-tooltip и отдельный selection halo без массовых device labels. Все 19 device types имеют уникальные SVG-atlas glyphs; карта, фильтры, строки аварий и карточка выбранного устройства используют единый type mapping, protocol badges и цветные telemetry-status squares. Полный отчёт: `reports/stage-six.md`.

### Этап 7. Управляющие команды — завершён и принят

- Включение/выключение и изменение setpoint.
- Confirmation dialog для потенциально критичных команд.
- Состояния `draft`, `pending`, `accepted`, `executed`, `failed`, `timedOut`.
- Раздельное отображение желаемого состояния, backend-подтверждения и фактической телеметрии.

Реализованы capability-driven on/off и setpoint drafts, обязательный confirmation dialog для помеченных критичными capabilities, идемпотентный `POST /api/v1/commands` и lookup fallback. In-memory simulator публикует полные records по цепочке `pending → accepted → executed | failed | timedOut` в общем ordered stream. После `executed` отдельный delayed telemetry patch синтетически подтверждает requested on/off или setpoint; `failed`/`timedOut` telemetry не меняют. Карточка явно разделяет draft desired intent, backend lifecycle и actual telemetry, поэтому convergence видна как отдельное событие. Полный отчёт: `reports/stage-seven.md`.

### Этап 8–9. Надёжность и автоматические тесты полного продукта — завершён и принят

- Дублированные, устаревшие и пропущенные сообщения.
- Команды во время disconnect.
- Неизвестные устройства и отсутствующий `roomId`.
- Одновременные аварии и burst при открытой карточке.
- Безопасное восстановление после reconnect.
- Unit-тесты stores, selectors, simulator и доменных переходов.
- Contract и schema tests.
- Компонентные тесты operator UI.
- E2E для этажей, поиска, picking, аварий, команд и reconnect.
- Проверки отсутствия массовых DOM-маркеров.

Этап 9 включён в этап 8: граничные сценарии считаются завершёнными только вместе с
автоматическими доказательствами на соответствующем уровне. Команда, принятая по HTTP при
недоступном realtime, отслеживается через GET fallback. Неопределённый результат POST не
повторяется в фоне: явный retry использует тот же idempotency key.

Реализованы contract-level uniqueness и reference integrity для snapshot, atomic rejection
unknown-device events, защита alarm/command lifecycle от stale regression, overlap replay,
single-flight resync и безопасный reconnect. Alarm burst публикуется в store один раз, а открытые
building/device overlays ограничены 50/10 строками с полным счётчиком. Nullable `roomId` явно
показывается как `Unassigned`. Command draft хранит стабильные request ID/timestamp для явного
retry; при недоступном WebSocket accepted command отслеживается GET polling без скрытой очереди.
Chromium acceptance разрывает только WebSocket, выполняет критичную команду через HTTP, видит
terminal state из polling, восстанавливает ordered stream и получает actual telemetry convergence.
Полный отчёт: `reports/stage-eight-nine.md`.

### Этап 10–11. Performance, оптимизация и финализация MVP — завершён и принят

- Репрезентативный dataset порядка десятков тысяч устройств.
- Отдельный stress fixture на 50 000 устройств.
- Floor и overview режимы.
- Pan, zoom, picking, фильтры, подписи и realtime burst.
- Измерение frame-time percentiles, long tasks, памяти, React commits и telemetry latency.
- Проверка на целевом desktop и репрезентативном мобильном браузере.
- Spatial index, clustering, workers и дополнительный culling добавляются только по результатам измерений.
- Полный прогон acceptance criteria.
- Воспроизводимый performance report.
- README с запуском, архитектурой, источниками, лицензией и ограничениями.
- Итоговый отчёт и список известных рисков.

Этап 11 включён в этап 10: результаты benchmark являются внутренним gate перед финализацией,
а итоговая приёмка охватывает performance evidence, полный продукт и документацию. Stage 10–11
также переводит человекочитаемую Markdown-документацию репозитория на русский; contract names,
API paths, code blocks и технические identifiers сохраняются без смыслового переименования.

Добавлены dedicated representative/stress benchmarks, instrumentation React/realtime и test-only
burst route. Измерения обосновали один стабильный основной `IconLayer`, GPU status filtering и
dirty-range updates; spatial index/clustering/workers не потребовались. Матрица
18 000/50 000 × desktop/mobile прошла вместе с `verify` и Chromium E2E. Документация переведена на
русский с сохранением технических identifiers. Отчёты: `reports/performance.md` и
`reports/stage-ten-eleven.md`.

---

## Отчёт о выполнении этапа 0

### Цель

Реализовать работающий backend-контракт выдачи сцены по этажу, viewport и zoom и показать в браузере один реальный этаж без устройств с плавным pan/zoom.

### Реализовано

#### Серверная часть

- Node.js + TypeScript + Fastify.
- `GET /api/health` — проверка состояния API.
- `GET /api/floors` — список доступных этажей.
- `POST /api/scene/query` — запрос сцены по:
  - `floorId`;
  - bbox в мировых координатах;
  - ширине и высоте viewport;
  - zoom.
- Runtime-валидация запросов и ответов через Zod.
- JSON Schema scene-контракта.
- Фильтрация геометрии по пересечению bbox.
- Zoom-based LOD: `overview`, `standard`, `detail`.

#### Реальная геометрия этажа

- Использован архитектурный IFC2x3 West Riverside Hospital.
- Исходный файл: около 80 МБ.
- SHA-256 проверен: `989ace1d52f694ee94d80bd99aa81d0ff3d76cf21f34fcfd00a286ac897ed8a6`.
- Выбран `Level 1`.
- Выполнено горизонтальное сечение на высоте 1,2 м.
- Координаты нормализованы в локальную систему этажа, единицы — метры.
- Подготовленная сцена занимает около 346 КБ.
- IFC не загружается и не разбирается в браузере.

Состав подготовленной сцены:

| Тип | Количество |
|---|---:|
| Участки стен | 473 |
| Колонны | 147 |
| Окна и витражные элементы | 303 |
| Двери | 139 |
| Базовый floor shell | 1 |
| **Всего** | **1 063** |

Источник: West Riverside Hospital, IFC-Bench/OpenIFC Model Repository. Лицензия исходной модели: CC BY 3.0.

#### Offline-конвейер

- Добавлен воспроизводимый download script с проверкой checksum.
- Добавлен Python extractor на IfcOpenShell и Shapely.
- Подготовленная сцена генерируется командой:

```bash
npm run data:floor
```

#### Клиентская часть

- React + TypeScript + Vite.
- deck.gl с `OrthographicView`.
- Отдельные `PolygonLayer`, `PathLayer` и `TextLayer`.
- Pan перетаскиванием.
- Zoom колесом, жестами и кнопками.
- `Fit` для возврата ко всему этажу.
- Debounced-запрос сцены после изменения viewport.
- Индикация zoom band, числа полученных объектов и текущего zoom.
- На стартовом масштабе отображается реальный план этажа без устройств.
- При приближении backend добавляет двери, окна и другую detail-геометрию.

#### LAN-доступ

Обычный dev-режим доступен только локально. Для просмотра с телефона в одной Wi-Fi сети:

```bash
npm run dev:api
npm run dev:web -- --host 0.0.0.0
```

После запуска frontend открывается по адресу `http://<LAN-IP-мака>:5173`.

#### Ограничения рендеринга

До начала device-этапа зафиксированы правила:

- один instanced `IconLayer` как исходный подход;
- texture atlas;
- GPU picking;
- отсутствие per-device DOM/React-компонентов;
- раздельное хранение metadata и hot telemetry;
- пакетное обновление dirty GPU-атрибутов;
- LOD для плана и подписей;
- spatial index, clustering и Web Worker — только после профилирования.

### Выполненные проверки

| Проверка | Результат |
|---|---|
| TypeScript strict typecheck | Пройдено |
| API и viewport unit/contract tests | 6 из 6 пройдено |
| Chromium E2E | Пройдено |
| Zoom до detail LOD в E2E | Пройдено |
| Production build | Пройдено |
| Dependency audit при установке | 0 известных уязвимостей |
| Визуальная проверка реального Level 1 | Пройдена |

### Известные ограничения этапа 0

- Подготовлен только архитектурный `Level 1`.
- Устройства, телеметрия, аварии и команды ещё не реализованы.
- Помещения не подписаны: в исходной модели нет пригодного набора `IfcSpace`, а автоматическое распознавание помещений не входит в MVP.
- Backend пока выполняет линейный проход по 1 063 feature Level 1; spatial index преждевременен до измерений.
- Начальный JavaScript bundle deck.gl — около 969 КБ minified / 285 КБ gzip; code splitting пока не выполнялся.
- Полный performance benchmark относится к отдельному будущему этапу.

### Основные артефакты

- `src/server/app.ts` — API и viewport/zoom filtering.
- `src/shared/scene-contracts.ts` — runtime-контракты.
- `src/client/src/FloorScene.tsx` — deck.gl viewer.
- `scripts/data-pipeline/extract_floor.py` — IFC-to-2D pipeline.
- `data/generated/west-riverside-level-1.scene.json` — подготовленная сцена.
- `docs/rendering-guidelines.md` — правила рендеринга больших наборов.
- `docs/adr/0001-viewport-scene-json.md` — scene API ADR.
- `docs/adr/0002-many-object-rendering.md` — rendering ADR.
- `reports/stage-zero.md` — краткий технический отчёт этапа.

### Дополнение: готовность live-demo

- Fastify подготовлен к раздаче production Vite build и API из одного процесса.
- Добавлена компиляция server-side TypeScript в `dist/server`.
- Добавлена production-команда `npm start`.
- Добавлен автоматический production smoke test.
- Добавлен `render.yaml` с health check и деплоем после успешных CI checks.
- Добавлен GitHub Actions workflow с verify и Chromium E2E jobs.
- Deployment-решение зафиксировано в `docs/adr/0003-render-live-demo.md`.
- Создан публичный репозиторий `mbob72/building-operator-demo` и Render service `building-operator-demo`.
- Production deployment и публичные endpoints `/`, `/api/health` и `/api/scene/query` проверены.

---

## Отчёт о выполнении этапа 1

### Результат

- Зафиксированы операторские сценарии, границы MVP и safety-инварианты.
- Определены building, floor, stable device metadata, hot telemetry, alarm и command contracts.
- `draft` команды отделён от backend lifecycle `pending -> accepted -> executed | failed | timedOut`.
- Определены REST-контракты каталога, authoritative snapshot, acknowledge, command create и command lookup.
- Определены WebSocket subscribe/resume, contiguous event batches, heartbeat и `resync.required`.
- Зафиксировано разделение plan scene, stable metadata, hot operational state, UI state и renderer state.
- Runtime Zod-контракты являются source of truth; Draft 2020-12 JSON Schema генерируется автоматически.
- Добавлены ADR-0004 и ADR-0005, contract tests и проверка freshness схем в `npm run verify`.

### Проверки

| Проверка | Результат |
|---|---|
| JSON Schema freshness | Пройдена |
| TypeScript strict typecheck | Пройден |
| Unit/API/contract tests | 13 из 13 пройдено |
| Stage 1 contract tests | 7 из 7 пройдено |
| Production build и smoke | Пройдены |
| Chromium E2E | 1 из 1 пройден |

### Ограничения

- Operational `/api/v1` endpoints и WebSocket пока определены как контракты, но не реализованы.
- На момент приёмки этапа 1 точное количество устройств ещё оставалось решением этапа 2.
- Production authentication/authorization не входит в MVP, actor IDs остаются mock-значениями.

Подробный технический отчёт: `reports/stage-one.md`.

---

## Отчёт о выполнении этапа 2

### Результат

- Из архитектурного IFC подготовлены восемь этажей и 3 688 объектов плана с LOD metadata, включая восемь full-range base shells.
- Подготовлен основной каталог ровно из 18 000 устройств; это воспроизводимый fixture, а не capacity limit.
- Подготовлен отдельный stress fixture на 50 000 устройств тем же pipeline.
- Сохранено 5 078 реальных IFC-устройств и их provenance; 12 922 устройства основного каталога явно помечены synthetic.
- Geometry-centroid fallback восстановил 15 IFC-кандидатов с нерепрезентативным insertion point.
- 183 кандидата детерминированно исключены после проверки placement и реальной геометрии, поскольку оба положения находятся вне архитектурных bounds.
- Все operational bindings остаются явно simulated; физические адреса автоматики не выдумываются.
- Добавлены manifest, SHA-256, byte-for-byte reproducibility check и ADR-0006.

### Проверки

| Проверка | Результат |
|---|---|
| Восемь floor scenes и LOD invariants | Пройдена, 3 688 объектов |
| Representative catalog | Пройден, 18 000 устройств |
| Stress catalog | Пройден, 50 000 устройств |
| Побайтовая воспроизводимость | Пройдена |
| Runtime/JSON Schema freshness | Пройдена |
| Unit/API/contract tests | 13 из 13 пройдено |
| Production build и smoke | Пройдены |
| Chromium E2E | 1 из 1 пройден |

Подробности: `reports/data-quality.md`.

---

## Отчёт о выполнении этапа 3

### Результат

- Реализован `GET /api/v1/catalog` с фильтрацией по этажу, runtime-валидацией, `ETag` и `304`.
- Level 1 загружает ровно 2 900 stable device metadata отдельно от viewport-сцены.
- Все устройства отображаются одним instanced deck.gl `IconLayer` через SVG texture atlas.
- Размер иконок адаптирован к zoom: 7 / 10 / 14 px.
- Выбор выполняется через GPU `pickObject()` только по device-слою.
- Выбранное устройство подсвечивается; React создаёт одну карточку, а не 2 900 DOM-маркеров.
- Карточка показывает тип, протокол, происхождение, координаты и число capabilities.
- Stable metadata не содержит telemetry/status; граница с будущим hot store сохранена.

### Проверки

| Проверка | Результат |
|---|---|
| Floor-scoped catalog | Пройден, 2 900 устройств Level 1 |
| API cache / `304` | Пройдена |
| Unit/API/contract tests | 15 из 15 пройдено |
| DOM guardrail | Менее 200 DOM-элементов при 2 900 устройствах |
| GPU picking и карточка | Chromium E2E пройден |
| Production build и smoke | Пройдены |

Подробности: `reports/stage-three.md`.
