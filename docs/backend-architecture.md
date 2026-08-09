# Backend architecture

- Актуально на: 2026-08-09
- Текущий этап: Stage 4, реализован, ожидает приёмки
- Назначение: живое описание реализованного backend; обновляется при каждом этапе и существенном изменении API, хранения или runtime topology.

## Роль backend

Backend — Node.js/TypeScript-приложение на Fastify. Он выдаёт браузеру подготовленную геометрию, stable device metadata и отдельный read-only operational snapshot.

```mermaid
flowchart LR
    FloorIndex["floor-index.json"]
    Scenes["8 scene JSONs"]
    CatalogFile["18k catalog.gz"]

    SceneRepo["SceneRepository<br/>ordered floors + Map by floorId"]
    CatalogRepo["DeviceCatalog<br/>stable metadata"]
    Snapshot["StateSnapshot<br/>status + telemetry"]

    FloorsAPI["GET /api/floors"]
    SceneAPI["POST /api/scene/query"]
    CatalogAPI["GET /api/v1/catalog"]
    SnapshotAPI["GET /api/v1/state/snapshot"]

    FloorIndex --> SceneRepo
    Scenes --> SceneRepo
    CatalogFile --> CatalogRepo
    CatalogRepo --> Snapshot

    SceneRepo --> FloorsAPI
    SceneRepo --> SceneAPI
    CatalogRepo --> CatalogAPI
    Snapshot --> SnapshotAPI
```

Backend не рендерит планы, не разбирает IFC на запросе и не подключается к физическим устройствам. Raw IFC обрабатывает отдельный offline pipeline.

## Почему Fastify

Fastify выполняет ту же роль, что Express: routes, lifecycle, plugins и static assets. Он выбран как TypeScript-friendly альтернатива с удобным `app.inject()` для тестов и plugin-моделью. Сейчас используются `@fastify/static` и `@fastify/compress`; Stage 5 сможет добавить realtime transport, не меняя application boundary.

Высокая производительность Fastify сама по себе не является архитектурной гарантией. Для MVP важнее явные контракты, startup validation и тестируемый `buildApp()`.

## Runtime topology

Development:

```text
Browser :5173 -> Vite / HMR
                    └── /api proxy -> Fastify 127.0.0.1:3001
```

Frontend использует относительные `/api/*`, поэтому штатному LAN/dev-потоку не нужен CORS.

Production:

```text
Browser -> one Fastify origin
           ├── /api/*
           └── dist/web/* + SPA fallback
```

Render запускает один Node service и проверяет `/api/health`. JSON-ответы больше 1 024 bytes сжимаются `@fastify/compress` при поддерживаемом `Accept-Encoding`.

## Startup lifecycle и repositories

`src/server/index.ts` читает `PORT`, `HOST`, `NODE_ENV`, строит приложение и корректно закрывает его на `SIGINT/SIGTERM`. Network listener отделён от `buildApp()`, поэтому API tests работают через `app.inject()`.

### Scene repository

`scene-repository.ts`:

1. читает `west-riverside.floor-index.json`;
2. валидирует индекс;
3. по `sceneFile` читает и валидирует восемь `PreparedScene`;
4. проверяет соответствие floor ID;
5. сохраняет упорядоченные summaries и `Map<floorId, scene>`.

Все подготовленные scenes вместе занимают около 1,2 МБ. Они загружаются один раз при старте. `sceneDatasetVersion` берётся из floor index.

### Device catalog repository

`device-catalog.ts` синхронно читает и распаковывает `west-riverside.devices-18000.json.gz`, валидирует полный `DeviceCatalog` и хранит его в памяти. Gzip-файл около 471 КБ. `selectCatalogFloors()` создаёт floor/building scope линейной фильтрацией массива.

### Stage 4 snapshot source

`state-snapshot.ts` отдельно от catalog вычисляет один детерминированный `DeviceTelemetry` на устройство:

- fixed timestamp и revision;
- status/connection по стабильному hash `deviceId`;
- telemetry values в соответствии с объявленными capabilities;
- `normal`: 16 906, `warning`: 473, `critical`: 189, `offline`: 432;
- пустые alarms/commands и sequence `0`.

Snapshot валидируется целиком через `StateSnapshotSchema`. Это read-only fixture для Stage 4 UI, а не realtime simulator. Status не записывается в `DeviceMetadata`.

## HTTP API

### `GET /api/health`

Возвращает `{ "status": "ok" }`; используется Render и production smoke test.

### `GET /api/floors`

Возвращает восемь подготовленных этажей в порядке `order`: Level 1–6, Level 7A, Level 7. Каждый summary содержит ID, name, elevation, bounds и order.

### `POST /api/scene/query`

```json
{
  "floorId": "west-riverside-level-2",
  "viewport": { "bbox": [0, 0, 104, 98], "width": 1200, "height": 800 },
  "zoom": 3.5
}
```

`SceneQuerySchema` валидирует body. Repository находит этаж, после чего backend оставляет features, пересекающие bbox и удовлетворяющие `minZoom <= zoom <= maxZoom`. Bands: `overview < 1.7`, `standard < 4.1`, иначе `detail`. `sceneVersion` объединяет dataset version и floor ID. Устройств в ответе нет.

### `GET /api/v1/catalog`

```http
GET /api/v1/catalog?buildingId=west-riverside&floorIds=<id>&floorIds=<id>
```

`floorIds` опционален и повторяем. Без него возвращается весь каталог на 18 000 устройств. Endpoint проверяет building/floors, возвращает только stable metadata, добавляет scope-dependent `ETag` и `Cache-Control: public, max-age=300, stale-while-revalidate=60`; совпавший `If-None-Match` получает `304`.

### `GET /api/v1/state/snapshot`

Query scope совпадает с catalog. Ответ содержит отдельные `telemetry`, `alarms`, `commands`, `streamId`, `sequence` и `generatedAt`. Для одного этажа число telemetry records равно числу устройств его catalog; без `floorIds` возвращается 18 000. Snapshot имеет собственный scope-dependent `ETag`, caching и `304`.

## Контракты и разделение данных

Runtime source of truth находится в `src/shared`:

- `scene-contracts.ts` — floor, scene query/response;
- `domain-contracts.ts` — metadata, telemetry, alarm, command;
- `api-contracts.ts` — catalog/snapshot/operational REST;
- `realtime-contracts.ts` — Stage 5 ordered transport.

```text
scene repository    -> geometry, keyed by floorId
device catalog      -> stable metadata, keyed by deviceId/floorId
state snapshot      -> mutable-shaped data, keyed by deviceId
```

Данные не мержатся на backend. JSON Schema artifacts в `contracts/` генерируются из Zod и проверяются `npm run contracts:check`.

## Ошибки, caching и compression

- `400` — schema-invalid query/body;
- `404` — неизвестный building/floor;
- `304` — совпавший catalog/snapshot ETag;
- `200` — успешный ответ.

Stage 0/3/4 routes ещё используют упрощённые `{ error, details? }`; единый `ApiError` middleware остаётся будущим улучшением. Compression применяется глобально к достаточно большим ответам, но ETag вычисляется из version/scope, а не из encoded body.

## Проверки Stage 4

API coverage проверяет:

- список и порядок восьми этажей;
- scene query другого этажа и dataset-aware version;
- viewport/zoom filtering;
- одиночный и повторяемый floor scope каталога;
- отсутствие status в stable metadata;
- deterministic snapshot на 2 900 и 18 000 records;
- наличие warning/critical, connection invariant, ETag и `304`;
- validation errors для неизвестных scopes.

Production smoke проверяет compiled server, HTML, scene, catalog и snapshot.

## Ограничения и следующий шаг

- Scenes, catalog и snapshot находятся в памяти одного процесса и синхронно загружаются при старте.
- Floor selection линейно фильтрует 18 000 records; индексы пока не нужны по измерениям этого этапа.
- Нет database, authentication/authorization, audit log и включённого Fastify logger.
- Snapshot статичен: нет WebSocket, replay, reconnect, resync и live updates.
- Scene/catalog/snapshot имеют отдельные version tokens; runtime compatibility handshake ещё не реализован.

Stage 5 должен превратить operational boundary в authoritative snapshot + mock ordered event stream, оставив catalog стабильным и заменяемым production backend.
