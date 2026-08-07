# Transport contracts

Runtime contracts live in `src/shared` and are the source of truth. The JSON Schema files in this directory are generated for backend-independent consumers.

```bash
npm run contracts:generate
npm run contracts:check
```

- `scene.schema.json` is the Stage 0 viewport-scene contract.
- `domain.schema.json` contains stable device metadata and hot operational entities.
- `api.schema.json` contains REST request and response payloads.
- `realtime.schema.json` contains WebSocket client/server messages and event batches.

Do not edit generated schema files by hand.

JSON Schema captures the portable wire shape. Cross-record and lifecycle invariants such as catalog references, alarm audit fields, contiguous stream sequences, and command terminal timestamps are enforced by the runtime schemas and documented in the ADRs.
