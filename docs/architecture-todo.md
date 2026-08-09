# Architecture TODO

- Актуально на: 2026-08-09
- Назначение: список незакрытых архитектурных рисков и решений, которые нельзя потерять между этапами.
- Правило обновления: проверять на границе каждого этапа и после связанных изменений; закрывать пункт только вместе с реализацией, проверками и обновлением архитектурных документов.

## Открытые пункты

Нет.

## Закрытые пункты

### ARCH-001 — Гарантировать непустую базовую геометрию для LOD

- Статус: `closed` 2026-08-09
- Обнаружено: Stage 4 review
- Области: offline data pipeline, scene contract, scene API, frontend rendering

#### Проблема

`POST /api/scene/query` независимо фильтрует prepared features по пересечению с viewport и условию `feature.minZoom <= zoom <= feature.maxZoom`. Если spatial candidates существуют, но ни один из них не проходит LOD-порог, backend законно возвращает `features: []`. Специального simplified `floor-shell`, серверного fallback и явного frontend empty-state сейчас нет.

Текущий dataset практически защищён назначением `minZoom: -8` для walls, columns и projection zones; все восемь этажей имеют ненулевой overview count. Однако это свойство не является контрактной гарантией: `validate_floors.ts` разрешает нулевые `byZoomBand` counts. Сохранение предыдущего payload в `FloorScene` и `BuildingOverview` предотвращает мерцание только во время запроса и не является геометрической заглушкой для успешного пустого ответа.

#### Реализованное решение

Offline pipeline строит convex hull всей подготовленной геометрии этажа и добавляет один явно обозначенный polygon `floor-shell` с диапазоном zoom `[-8, 24]`. Runtime-контракт требует, чтобы его bbox покрывал bbox каждого feature; validator требует ровно один такой shell и ненулевую геометрию во всех LOD bands. Dataset пересобран как `west-riverside-stage-2-v2`.

Scene API отдельно вычисляет spatial candidates и LOD, возвращая nullable `meta.emptyReason`: `viewport-outside-floor`, `no-spatial-features` или `lod-filtered`. `FloorScene` показывает диагностический empty-state, а overview сообщает число пустых floor responses.

#### Критерии закрытия

- [x] Определён и записан контракт базовой геометрии этажа: feature kind, диапазон zoom и требования к bounds/coverage.
- [x] Pipeline генерирует базовую simplified geometry для каждого этажа, включая projection fallback floors.
- [x] `validate_floors.ts` отклоняет этаж без overview geometry и без обязательного base feature.
- [x] API-тесты проверяют ненулевой full-floor overview для всех подготовленных этажей.
- [x] Определено поведение API, когда viewport не пересекает этаж, и когда spatial candidates существуют, но отфильтрованы LOD.
- [x] Frontend различает loading, error и успешный пустой scene response и показывает диагностический empty-state.
- [x] Обновлены `docs/architecture.md`, `docs/frontend-architecture.md`, `docs/backend-architecture.md` и отчёт Stage 4.

#### Связанные места

- `scripts/data-pipeline/extract_floor.py` — назначение `minZoom` и генерация prepared features.
- `scripts/data-pipeline/validate_floors.ts` — проверка feature/LOD counts.
- `src/server/app.ts` — viewport и zoom filtering.
- `src/client/src/FloorScene.tsx` — сохранение предыдущей сцены во время запроса.
- `src/client/src/BuildingOverview.tsx` — TanStack Query `placeholderData` между LOD bands.
