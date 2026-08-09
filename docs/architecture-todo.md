# Architecture TODO

- Актуально на: 2026-08-09
- Назначение: список незакрытых архитектурных рисков и решений, которые нельзя потерять между этапами.
- Правило обновления: проверять на границе каждого этапа и после связанных изменений; закрывать пункт только вместе с реализацией, проверками и обновлением архитектурных документов.

## Открытые пункты

### ARCH-001 — Гарантировать непустую базовую геометрию для LOD

- Статус: `open`
- Обнаружено: Stage 4 review
- Области: offline data pipeline, scene contract, scene API, frontend rendering

#### Проблема

`POST /api/scene/query` независимо фильтрует prepared features по пересечению с viewport и условию `feature.minZoom <= zoom <= feature.maxZoom`. Если spatial candidates существуют, но ни один из них не проходит LOD-порог, backend законно возвращает `features: []`. Специального simplified `floor-shell`, серверного fallback и явного frontend empty-state сейчас нет.

Текущий dataset практически защищён назначением `minZoom: -8` для walls, columns и projection zones; все восемь этажей имеют ненулевой overview count. Однако это свойство не является контрактной гарантией: `validate_floors.ts` разрешает нулевые `byZoomBand` counts. Сохранение предыдущего payload в `FloorScene` и `BuildingOverview` предотвращает мерцание только во время запроса и не является геометрической заглушкой для успешного пустого ответа.

#### Предпочтительное направление

Гарантировать базовое представление на этапе подготовки данных: каждый этаж должен иметь явно обозначенный simplified `floor-shell` или эквивалентный footprint, видимый во всём поддерживаемом диапазоне zoom. Не возвращать произвольную detail-геометрию на backend при пустом LOD, поскольку это нарушит предсказуемость объёма ответа и renderer LOD.

Если продукт допускает валидный пустой viewport за пределами здания, его нужно отличать от ошибки подготовки этажа и от ситуации «LOD отфильтровал все существующие spatial candidates».

#### Критерии закрытия

- [ ] Определён и записан контракт базовой геометрии этажа: feature kind, диапазон zoom и требования к bounds/coverage.
- [ ] Pipeline генерирует базовую simplified geometry для каждого этажа, включая projection fallback floors.
- [ ] `validate_floors.ts` отклоняет этаж без overview geometry и без обязательного base feature.
- [ ] API-тесты проверяют ненулевой full-floor overview для всех подготовленных этажей.
- [ ] Определено поведение API, когда viewport не пересекает этаж, и когда spatial candidates существуют, но отфильтрованы LOD.
- [ ] Frontend различает loading, error и успешный пустой scene response; при необходимости показывает диагностический empty-state.
- [ ] Обновлены `docs/architecture.md`, `docs/frontend-architecture.md`, `docs/backend-architecture.md` и отчёт соответствующего этапа.

#### Связанные места

- `scripts/data-pipeline/extract_floor.py` — назначение `minZoom` и генерация prepared features.
- `scripts/data-pipeline/validate_floors.ts` — проверка feature/LOD counts.
- `src/server/app.ts` — viewport и zoom filtering.
- `src/client/src/FloorScene.tsx` — сохранение предыдущей сцены во время запроса.
- `src/client/src/BuildingOverview.tsx` — TanStack Query `placeholderData` между LOD bands.

