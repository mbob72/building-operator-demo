# Building Operator MVP — Release Notes

## Текущий статус

- Текущий этап: **этап 2 в разработке**.
- Этапы 0 и 1 завершены и приняты; этап 0 опубликован.
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

### Этап 2. Полный offline data pipeline

- Извлечь необходимые этажи West Riverside Hospital.
- Подготовить уровни детализации архитектурной геометрии.
- Исследовать инженерные IFC-дисциплины и реальные координаты подходящих элементов.
- Сгенерировать недостающие устройства с фиксированным seed.
- Подготовить репрезентативный набор порядка десятков тысяч устройств.
- Явно маркировать `dataOrigin: ifc | derived | synthetic`.
- Сформировать отчёт о качестве данных и воспроизводимости.

### Этап 3. Минимальный device vertical slice

- Загрузить стабильные метаданные устройств.
- Показать устройства одного этажа через deck.gl `IconLayer`.
- Добавить texture atlas, instanced rendering и GPU picking.
- Открывать карточку выбранного устройства.
- Не создавать React/DOM-компонент для каждого устройства.

### Этап 4. Floor mode и building overview

- Переключение этажей.
- Overview всех этажей и устройств.
- Zoom, pan, fit и picking.
- Уровни детализации плана и подписей.
- Поиск и фильтры по типу, протоколу и состоянию.
- Сохранение видимости warning/critical состояний при любом LOD.

### Этап 5. Realtime transport и hot telemetry store

- WebSocket abstraction и mock simulator.
- Нормальная нагрузка и burst-сценарии.
- Разрыв соединения, reconnect и snapshot/resync.
- Индексированное хранение состояния по `deviceId`.
- Coalescing повторных событий и пакетное обновление dirty GPU-атрибутов.
- Отсутствие React-render на каждое realtime-сообщение.

### Этап 6. Аварии

- Warning и critical alarm на плане.
- Состояния `active`, `acknowledged`, `resolved`.
- Список и фильтрация аварий.
- Переход к аварийному устройству.
- Acknowledge с автором и временем.

### Этап 7. Управляющие команды

- Включение/выключение и изменение setpoint.
- Confirmation dialog для потенциально критичных команд.
- Состояния `draft`, `pending`, `accepted`, `executed`, `failed`, `timedOut`.
- Раздельное отображение желаемого состояния, backend-подтверждения и фактической телеметрии.

### Этап 8. Надёжность и граничные сценарии

- Дублированные, устаревшие и пропущенные сообщения.
- Команды во время disconnect.
- Неизвестные устройства и отсутствующий `roomId`.
- Одновременные аварии и burst при открытой карточке.
- Безопасное восстановление после reconnect.

### Этап 9. Автоматические тесты полного продукта

- Unit-тесты stores, selectors, simulator и доменных переходов.
- Contract и schema tests.
- Компонентные тесты operator UI.
- E2E для этажей, поиска, picking, аварий, команд и reconnect.
- Проверки отсутствия массовых DOM-маркеров.

### Этап 10. Performance benchmark и оптимизация

- Репрезентативный dataset порядка десятков тысяч устройств.
- Отдельный stress fixture на 50 000 устройств.
- Floor и overview режимы.
- Pan, zoom, picking, фильтры, подписи и realtime burst.
- Измерение frame-time percentiles, long tasks, памяти, React commits и telemetry latency.
- Проверка на целевом desktop и репрезентативном мобильном браузере.
- Spatial index, clustering, workers и дополнительный culling добавляются только по результатам измерений.

### Этап 11. Финализация MVP

- Полный прогон acceptance criteria.
- Воспроизводимый performance report.
- README с запуском, архитектурой, источниками, лицензией и ограничениями.
- Итоговый отчёт и список известных рисков.

---

## Отчёт о выполнении этапа 0

### Цель

Реализовать работающий backend-контракт выдачи сцены по этажу, viewport и zoom и показать в браузере один реальный этаж без устройств с плавным pan/zoom.

### Реализовано

#### Backend

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
| **Всего** | **1 062** |

Источник: West Riverside Hospital, IFC-Bench/OpenIFC Model Repository. Лицензия исходной модели: CC BY 3.0.

#### Offline pipeline

- Добавлен воспроизводимый download script с проверкой checksum.
- Добавлен Python extractor на IfcOpenShell и Shapely.
- Подготовленная сцена генерируется командой:

```bash
npm run data:floor
```

#### Frontend

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

#### Rendering guardrails

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
- Backend пока выполняет линейный проход по 1 062 feature; spatial index преждевременен до появления полного набора этажей и измерений.
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
- Точное количество устройств остаётся решением этапа 2; отдельный fixture на 50 000 сохраняется для stress-теста.
- Production authentication/authorization не входит в MVP, actor IDs остаются mock-значениями.
- Этап 2 и последующие этапы не начаты.

Подробный технический отчёт: `reports/stage-one.md`.
