# Последовательная доска задач

## Этап 0 — прототип viewport-сцены

- [x] Зафиксировать scope, acceptance, runtime/JSON contracts.
- [x] Реализовать floor/scene API, bbox/zoom filtering и ортографический viewer.
- [x] Реализовать pan/zoom/fit/diagnostics и browser smoke.
- [x] Зафиксировать rendering/realtime guardrails.
- [x] Подготовить GitHub Actions, repository и Render deployment.
- [x] Пройти verification и получить приёмку.

## Этап 1 — продукт и доменные контракты

- [x] Описать workflows и границы MVP.
- [x] Определить domain, REST и ordered realtime contracts.
- [x] Разделить stable/hot/UI/renderer state.
- [x] Генерировать backend-independent JSON Schema.
- [x] Добавить contract/lifecycle tests и ADR.
- [x] Пройти verification и получить приёмку.

## Этап 2 — offline data pipeline

- [x] Утвердить 18 000 representative и 50 000 stress devices.
- [x] Скачать и SHA-256 проверить IFC2X3 MEP sources.
- [x] Проверить storeys/classes/placements/coordinates.
- [x] Извлечь восемь floors и LOD metadata.
- [x] Сохранить IFC provenance и нормализовать coordinates.
- [x] Deterministic generation недостающих категорий с fixed seed.
- [x] Проверить contracts/data quality/reproducibility.
- [x] Подготовить отчёт, пройти verification и приёмку.

## Этап 3 — минимальный device slice

- [x] Загрузить stable metadata одного этажа.
- [x] Отрисовать devices через deck.gl `IconLayer`/atlas/GPU picking без per-device DOM.
- [x] Открывать карточку выбранного устройства.
- [x] Добавить API/UI/browser tests, пройти verification и приёмку.

## Этап 4 — floor mode и building overview

- [x] Выдать восемь floor scenes и добавить переключение.
- [x] Показать side-by-side overview с 18 000 devices.
- [x] Сохранить pan/zoom/fit/GPU picking и LOD.
- [x] Добавить search/type/protocol/status filters.
- [x] Сохранять warning/critical на всех LOD.
- [x] Добавить coverage, обновить architecture/report, пройти verification и приёмку.

## Этапы 5–7

- [x] Ordered realtime state и explicit approval (этап 5).
- [x] Alarms и explicit approval (этап 6).
- [x] Simulated commands и explicit approval (этап 7).

## Объединённые этапы 8–9 — надёжность и полный automated acceptance

- [x] Получить разрешение и определить disconnect command safety/idempotent retry.
- [x] Защитить duplicate/stale/gap/stream-change/reconnect recovery.
- [x] Обработать unknown devices и nullable `roomId`.
- [x] Сохранять selection/UI state при alarm burst.
- [x] Добавить command lookup fallback без realtime.
- [x] Закрыть unit/contract/API/component/E2E/DOM coverage.
- [x] Обновить architecture/report, пройти verification и получить приёмку.

## Объединённые этапы 10–11 — производительность и финализация MVP

- [x] Получить явное разрешение на объединённый этап.
- [x] Зафиксировать benchmark boundary и язык документации.
- [x] Добавить browser benchmark для 18 000 и 50 000 устройств.
- [x] Измерить floor/building, burst, memory, long tasks, React commits и latency.
- [x] Реализовать подтверждённые измерениями оптимизации и before/after evidence.
- [x] Перевести человекочитаемый Markdown репозитория на русский.
- [x] Завершить architecture/deployment/source/license/limitations/risk review.
- [x] Выполнить `verify`, browser acceptance и performance acceptance.
- [x] Представить завершённый MVP и получить явную финальную приёмку.
