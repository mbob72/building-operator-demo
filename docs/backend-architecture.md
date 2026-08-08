# Backend architecture

- Актуально на: 2026-08-08
- Текущий этап: Stage 3, готов к приёмке
- Назначение: живое описание реализованного backend; документ обновляется при завершении каждого этапа и при существенном изменении API, хранения данных или runtime topology.

## Роль backend

Backend — Node.js/TypeScript-приложение на Fastify. Он создаёт стабильную HTTP-границу между браузером и подготовленными offline-данными.

```text
Browser
  ├── GET  /api/health
  ├── GET  /api/floors
  ├── POST /api/scene/query
  └── GET  /api/v1/catalog
                 │
              Fastify
                 │
      ┌──────────┴──────────┐
      │                     │
prepared floor scene   device catalog
scene JSON             gzip JSON
```

Fastify не выполняет рендеринг, не разбирает IFC во время запроса и не подключается к физическим устройствам. IFC обрабатывается отдельным offline pipeline.

## Почему Fastify

Fastify выполняет ту же архитектурную роль, что и Express: маршрутизация, request/response lifecycle, plugins и раздача static assets. Для проекта он выбран как современная TypeScript-friendly альтернатива с удобным `app.inject()` для тестов и подходящей plugin-моделью для будущего realtime transport.

Текущая реализация не зависит от специфической высокой производительности Fastify: Express также мог бы обслуживать этот объём. Основная ценность здесь — явная backend-граница и тестируемый application factory.

## Runtime topology

### Development

```text
Browser
  │ http://<host>:5173
  ▼
Vite dev server
  ├── HTML / React modules / HMR
  └── /api/* proxy
           │
           ▼
Fastify http://127.0.0.1:3001
```

Frontend использует относительные `/api/*` URL. Vite proxy пересылает их в Fastify, поэтому CORS для штатного dev-потока не нужен.

### Production

```text
Browser
  │ one origin
  ▼
Fastify
  ├── /api/*
  └── dist/web/*
```

При `NODE_ENV=production` Fastify подключает `@fastify/static` и раздаёт Vite build. Не-API GET fallback возвращает `index.html`, чтобы frontend routes могли обслуживаться как SPA. Render запускает один Node service и проверяет `/api/health`.

## Startup lifecycle

Entry point `src/server/index.ts`:

1. читает `PORT`, `HOST` и `NODE_ENV`;
2. вызывает `buildApp({ serveStatic: isProduction })`;
3. начинает слушать порт;
4. обрабатывает `SIGINT` и `SIGTERM` через graceful `app.close()`.

Application factory отделён от сетевого listener. Благодаря этому тесты создают Fastify instance и вызывают routes через `app.inject()` без реального порта.

## Источники runtime-данных

### Prepared scene

`src/server/scene-fixture.ts` читает `data/generated/west-riverside-level-1.scene.json`, парсит JSON и валидирует его через `PreparedSceneSchema`.

В памяти сохраняются:

- floor metadata;
- source/provenance архитектурной модели;
- полный массив подготовленных `SceneFeature` Level 1.

Raw IFC не загружается и не разбирается backend во время работы.

### Device catalog

`src/server/device-catalog.ts` при старте:

1. читает `west-riverside.devices-18000.json.gz`;
2. распаковывает gzip через `gunzipSync`;
3. парсит JSON;
4. валидирует полный каталог через `DeviceCatalogSchema`;
5. сохраняет 18 000 stable device metadata records в памяти.

`selectCatalogFloors()` формирует floor-scoped ответ, фильтруя floor и device arrays. Для Level 1 возвращается 2 900 устройств.

## HTTP API

### Health

```http
GET /api/health
```

Возвращает `{ "status": "ok" }`. Используется production smoke test и Render health check.

### Floors

```http
GET /api/floors
```

Сейчас возвращает только Level 1 scene fixture. Полный переход на восемь подготовленных этажей относится к Stage 4.

### Viewport-aware scene

```http
POST /api/scene/query
Content-Type: application/json

{
  "floorId": "west-riverside-level-1",
  "viewport": {
    "bbox": [minX, minY, maxX, maxY],
    "width": 1200,
    "height": 800
  },
  "zoom": 3.5
}
```

Обработка:

1. `SceneQuerySchema` валидирует body.
2. Backend проверяет `floorId`.
3. Для каждого feature проверяется пересечение его `bbox` с viewport bbox.
4. Проверяется диапазон `feature.minZoom <= zoom <= feature.maxZoom`.
5. Ответ получает `overview`, `standard` или `detail` zoom band.
6. Возвращается только подходящий массив архитектурных features.

Endpoint не содержит устройств. Его данные используются `PolygonLayer`, `PathLayer` и `TextLayer`.

### Stable device catalog

```http
GET /api/v1/catalog?buildingId=west-riverside&floorIds=west-riverside-level-1
```

Обработка:

1. `CatalogQuerySchema` валидирует query parameters.
2. Backend проверяет building и каждый floor ID.
3. Каталог фильтруется по выбранным этажам.
4. Из `catalogVersion` и floor IDs вычисляется `ETag`.
5. При совпадающем `If-None-Match` возвращается `304`.
6. Иначе возвращаются building, выбранные floors, devices и `totalDevices`.

Ответ кешируется с `Cache-Control: public, max-age=300, stale-while-revalidate=60`. Endpoint возвращает только stable metadata и не добавляет telemetry/status.

## Контракты

Runtime source of truth находится в `src/shared`:

- `scene-contracts.ts` — floor, scene query и scene response;
- `domain-contracts.ts` — building, floor, device, telemetry, alarm и command entities;
- `api-contracts.ts` — catalog, snapshot, acknowledge и command API;
- `realtime-contracts.ts` — будущий ordered realtime transport.

Zod используется на границе входящих запросов и при startup-валидации подготовленных данных. Backend-independent Draft 2020-12 schemas генерируются в `contracts/` и проверяются командой `npm run contracts:check`.

## Scene и catalog не мержатся

Backend обслуживает два независимых data products:

```text
prepared scene  -> архитектурные features
device catalog  -> stable device metadata
```

Связь обеспечивается одинаковым `floorId` и общей floor-local системой координат. На frontend они поступают в разные deck.gl layers. Сейчас `sceneVersion` и `catalogVersion` независимы; общий compatibility/dataset version ещё не проверяется runtime.

## Ошибки и валидация

Сейчас routes возвращают:

- `400` для некорректной структуры запроса;
- `404` для неизвестного building/floor;
- `304` для неизменившегося каталога;
- `200` для успешного ответа.

Stage 1 определил единый `ApiError`, но текущие Stage 0/3 endpoints пока используют упрощённые `{ error, details? }` payloads. Унификация error middleware остаётся отдельной задачей.

## Тестирование

API tests используют `buildApp()` и `app.inject()`:

- проверяют runtime-валидность scene response;
- проверяют viewport filtering;
- проверяют zoom LOD;
- проверяют invalid/unknown queries;
- проверяют ровно 2 900 устройств Level 1;
- проверяют разделение IFC/synthetic provenance;
- проверяют отсутствие hot status в stable metadata;
- проверяют `ETag` и `304`.

Production smoke запускает скомпилированный Node server, проверяет HTML, scene query и floor-scoped catalog.

## Текущие ограничения

- Scene API обслуживает только Level 1, хотя offline pipeline уже подготовил восемь этажей.
- Scene features и полный каталог хранятся в памяти одного процесса.
- Catalog floor selection выполняет линейную фильтрацию 18 000 devices на запрос.
- Используются синхронные startup read/gunzip/parse; это допустимо для текущего единовременного запуска.
- Нет базы данных, authentication/authorization и production audit log.
- Fastify logger пока отключён.
- Нет response compression plugin на origin.
- Нет snapshot, commands, alarms и WebSocket runtime, хотя их контракты определены.
- Нет общего version token, подтверждающего совместимость scene и catalog.

## Следующие изменения

Stage 4 должен перевести scene repository на восемь этажей и добавить building/floor queries. Stage 5 добавит mock realtime transport, authoritative snapshot и индексированное hot state. По мере роста backend следует выделить repositories/services, единый error handler, dataset compatibility version и измерить необходимость индексов или другого хранения до добавления инфраструктуры.
