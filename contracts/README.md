# Транспортные контракты

Runtime-контракты находятся в `src/shared` и являются source of truth. JSON Schema в этом каталоге
генерируются для потребителей, не зависящих от backend.

```bash
npm run contracts:generate
npm run contracts:check
```

- `scene.schema.json` — viewport-scene контракт этапа 0.
- `domain.schema.json` — stable metadata устройств и hot operational entities.
- `api.schema.json` — payload запросов и ответов REST.
- `realtime.schema.json` — клиентские/серверные сообщения ordered realtime и recovery.

Не редактируйте сгенерированные файлы вручную. Исключение — legacy `scene.schema.json` этапа 0.
