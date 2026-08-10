# Отчёт этапов 10–11 — производительность и финализация MVP

- Дата реализации: 2026-08-10
- Дата приёмки: 2026-08-10
- Статус: завершены и приняты пользователем
- Граница: объединённые этапы 10 и 11; следующие roadmap stages не начинались

## Результат

Добавлен воспроизводимый browser benchmark для representative/stress datasets, выполнена
measurement-driven оптимизация WebGL hot path, пройдена полная functional/performance матрица и
финализирована русскоязычная документация MVP.

Пользовательские workflow и публичные product API не менялись. Test-only performance route
отсутствует в обычном runtime и включается только явной environment-переменной.

## Benchmark

- Fixtures: 18 000 и 50 000 устройств.
- Профили: desktop Chromium и Pixel 7 emulation.
- Сценарии: floor pan/zoom/fit, overview, GPU picking, status filter/reset, normal realtime и burst.
- Метрики: p50/p95/p99/max frames, long tasks по фазам, heap, React commits, batch apply,
  end-to-end latency, cursor delta и DOM cardinality.
- Target graphics: ANGLE Metal на Apple M1 Pro; renderer записывается в каждый raw JSON.
- Команда: `npm run test:performance`.

Финальная матрица прошла все бюджеты. P95 frame interval во всех четырёх профилях и трёх фазах
составил 10,2–10,3 ms; max long task — 160 ms; heap — 75,2–148,1 MB; React p95 — 10,8–20,1 ms;
batch apply p95 — 3,2–6,7 ms; realtime latency p95 — 12–47 ms. Полные данные:
[`reports/performance.md`](performance.md).

## Оптимизация

- Добавлен `@deck.gl/extensions` и GPU visibility filter через `DataFilterExtension`.
- Renderer получает stable scoped array и `visibleDeviceIds`, не массивы с постоянно меняющимся
  membership.
- Два normal/priority `IconLayer` заменены одним основным layer; status color/size сохраняются.
- `_dataDiff` обновляет только dirty row ranges при status transitions.
- Удалён больше не нужный frontend field/selector `priorityMembershipChanged`.
- Добавлена instrumentation React/realtime без влияния на product UI.
- Benchmark trace отключён из-за синхронного canvas readback; SwiftShader исключён как неверный
  target backend, но диагностические результаты и причина исключения записаны.

## Backend и test isolation

- Catalog fixture, simulator interval/batch size задаются environment.
- `POST /api/benchmark/realtime-burst` регистрируется только с `ENABLE_PERFORMANCE_ROUTES=1`.
- Production defaults и публичные `/api/v1` contracts не изменены.
- Dedicated Playwright config использует отдельные ports и последовательно запускает profiles.

## Документация

Человекочитаемый Markdown продукта переведён на русский: корневой README/ReleaseNote, contracts
README, source model card, product/architecture/frontend/backend/deployment/realtime/rendering docs,
ADR, stage/data/performance reports и task board. API paths, type names, CLI, file names, protocol
terms и code blocks сохранены для точности. Нормативные agent/tool instruction files не
переписывались, чтобы не изменить рабочие правила.

Архитектурные документы обновлены для однослойного renderer, GPU filtering, benchmark runtime,
test-only route и итоговых ограничений.

## Проверка

| Проверка | Результат |
|---|---|
| `npm run verify` | пройдено |
| Contract freshness | пройдено |
| Data validation | 8 floors, 18 000 и 50 000 — пройдено |
| Unit/API/component | 23 файла, 100 тестов — пройдено |
| Strict typecheck | пройдено |
| Server/Vite production build | пройдено |
| Production smoke | пройдено |
| `npm run test:e2e` | 1 Chromium scenario — пройдено |
| `npm run test:performance` | 4/4 profiles — пройдено |

Vite сохраняет предупреждение о main chunk около 1,09 MB minified / 319 kB gzip. Это известное
ограничение, не повлиявшее на acceptance metrics.

## Известные риски и границы

- Pixel 7 — browser/device emulation на host Metal GPU, не физическое Android-устройство.
- Нет многочасового soak/server-saturation benchmark.
- State/replay/commands/idempotency остаются process-local и недолговечными.
- Нет production auth, trusted audit, database и physical protocol adapter.
- Spatial index, clustering, worker/culling/binary attributes не добавлены без измеренного bottleneck.

## Итоговый статус

Объединённые этапы 10–11 реализованы, проверены и приняты пользователем. MVP завершён и готов к
коммиту; агент не выполнял Git-команды.
