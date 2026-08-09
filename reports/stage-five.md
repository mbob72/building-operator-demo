# Stage 5 report — realtime transport and hot telemetry store

Дата: 2026-08-09  
Статус: реализован, ожидает явной приёмки пользователя

## Результат

Операторский frontend получает authoritative building snapshot, продолжает его ordered WebSocket stream и показывает live cursor. Нормальный mock-поток передаёт 24 telemetry events одним batch каждые 250 мс. Disconnect восстанавливается через resume/replay, а смена stream, cursor gap или истёкший replay — через атомарный HTTP snapshot resync.

Stable catalog, hot operational state, Zustand UI state и deck.gl renderer state остаются раздельными. Telemetry одного устройства не меняет metadata и не заставляет React рендерить все устройства.

## Backend

- Добавлен `RealtimeEngine` с индексированным authoritative state, process-scoped `streamId` и building-scoped monotonic sequence.
- Snapshot отражает текущий engine cursor, имеет `Cache-Control: no-store` и scope-dependent ID/ETag.
- `WS /api/v1/realtime` поддерживает `resume`, `hello`, replay, live batches, heartbeat и `resync.required`.
- Replay ограничен последними 5 000 событиями; cursor вне окна восстанавливается через snapshot.
- Per-device revision отбрасывает поздний patch без расходования нового sequence.
- Mock simulator генерирует 96 events/s; один timer tick даёт один listener notification и один transport batch.
- Runtime запускает simulator через Fastify lifecycle; tests могут inject-ить engine без nondeterministic timer.
- Vite dev proxy и production Fastify origin поддерживают WebSocket upgrade.

## Frontend

- `useRealtimeBootstrap` делает прямой abortable HTTP snapshot request без TanStack Query cache, атомарно заполняет hot store и только затем запускает WebSocket.
- `RealtimeClient` resume-ится от bootstrap cursor, применяет ordered batches и переподключается с backoff 250–5 000 мс.
- Gap, stream mismatch, invalid local state и server `resync.required` приводят к authoritative snapshot replacement.
- `RealtimeHotStore` индексирует telemetry/status/alarms/commands по ID и публикует одно notification на batch.
- Selective `useSyncExternalStore` subscriptions разделяют update domains:
  - toolbar наблюдает только connection/cursor;
  - `DeviceCard` — telemetry выбранного device ID;
  - workspace/renderers — status map и renderer versions.
- Value-only batch не меняет status map, dirty set и renderer versions, поэтому device layers сохраняют identity.
- Status update передаёт минимальные contiguous `_dataDiff` ranges в deck.gl.
- Переход устройства между normal/offline и warning/critical меняет priority membership и безопасно полностью перегруппировывает два `IconLayer`.
- Status filter пересчитывает visible catalog на status update только когда этот filter активен.

## Ordering и recovery invariants

1. `streamId` определяет область валидности sequence.
2. Batch применяется только если первый новый event продолжает локальный cursor без gap.
3. Duplicate sequences игнорируются.
4. Stale device revision не меняет telemetry, но уже полученный contiguous stream cursor продвигается.
5. Snapshot атомарно заменяет все hot indexes и cursor.
6. Один building stream не фильтруется сервером по floor, иначе общий sequence создавал бы ложные gaps.

## Проверки

| Проверка | Результат |
|---|---|
| Contract generation check | пройдено |
| Prepared scenes + 18k/50k catalog validation | пройдено |
| Unit/contract/API/component tests | 63 из 63 пройдено |
| 1 000-event coalesced burst test | пройдено |
| TypeScript strict typecheck | пройдено |
| Production server/web build | пройдено |
| Production HTTP + WebSocket resume smoke | пройдено |
| Chromium live workflow E2E | пройдено за 12,4 с |

Chromium acceptance проверяет рост live sequence вместе с floor switch, zoom, search, status filter, building overview, GPU picking и live device card. Selector component test отдельно доказывает, что update другого устройства не рендерит consumer выбранного устройства.

## Осознанные ограничения

- Engine и replay находятся в памяти одного процесса; restart намеренно меняет stream и требует snapshot resync.
- Replay не является durable event log и не разделяется между несколькими server instances.
- Browser acceptance проверяет штатный live stream; forced reconnect/resync детерминированно покрыт client и WebSocket API tests.
- Alarm и command events предусмотрены контрактом/store, но их UI и lifecycle относятся к Stage 6/7.
- Полный representative/stress performance benchmark, frame-time, memory и latency percentiles остаются Stage 10.
- Vite сохраняет предупреждение о frontend chunk около 1,04 МБ minified; корректность Stage 5 от этого не зависит.
