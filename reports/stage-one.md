# Stage 1 report — product model and domain contracts

## Result

Stage 1 defines the product boundary and backend-independent contract baseline for device metadata, telemetry, alarms, commands, snapshots, and realtime recovery. No Stage 2 data pipeline or later device UI work was started.

## Delivered

- Operator workflows for floor monitoring, alarm triage, simulated command execution, and reconnect recovery.
- Runtime Zod schemas for building, floor, device metadata, capabilities, bindings, telemetry, alarms, UI command drafts, and backend command records.
- REST payload schemas for catalog, state snapshot, alarm acknowledgement, command creation, command lookup, and errors.
- Realtime schemas for subscribe, resume, hello, contiguous event batches, heartbeat, and `resync.required`.
- Generated Draft 2020-12 JSON Schema for domain, REST, and realtime consumers.
- Semantic validation for catalog references, duplicate IDs, binding protocols, telemetry connection/status, alarm audit fields, command terminal fields, and event sequence continuity.
- ADR-0004 for stable/hot/UI state separation.
- ADR-0005 for ordered realtime replay and HTTP snapshot fallback.
- A repository working agreement recording single-agent development and stage approval gates.

## Verification

| Check | Result |
| --- | --- |
| Generated contract freshness | Passed |
| TypeScript strict typecheck | Passed |
| Unit/API/contract tests | 13 of 13 passed |
| Stage 1 contract tests | 7 of 7 passed |
| Server production build | Passed |
| Vite production build | Passed |
| Production HTTP/API smoke | Passed |
| Chromium E2E | 1 of 1 passed |

## Known limitations

- The new `/api/v1` operational endpoints and WebSocket transport are contracts only; implementation belongs to later approved stages.
- The exact representative device count remains a data-stage decision. A separate 50,000-device stress fixture remains required.
- JSON Schema captures portable wire structure. Cross-record and lifecycle invariants require the runtime validators or equivalent backend logic.
- Catalog delivery starts as one versioned document for the requested building/floors; pagination or binary encoding is measurement-driven.
- Production authentication and authorization are not defined; actor fields contain mock IDs.
- The frontend bundle retains the existing deck.gl size warning of approximately 969 kB minified / 285 kB gzip.

## Primary artifacts

- `docs/product.md`
- `docs/architecture.md`
- `docs/assumptions.md`
- `docs/adr/0004-separate-stable-hot-ui-state.md`
- `docs/adr/0005-ordered-realtime-with-snapshot-resync.md`
- `src/shared/domain-contracts.ts`
- `src/shared/api-contracts.ts`
- `src/shared/realtime-contracts.ts`
- `contracts/domain.schema.json`
- `contracts/api.schema.json`
- `contracts/realtime.schema.json`
- `tests/contracts/operator-contracts.test.ts`
