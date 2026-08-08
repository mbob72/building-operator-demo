# Stage 3 — minimal device vertical slice

Date: 2026-08-07. Status: ready for approval.

## Outcome

Level 1 now renders its 2,900 stable device records over the prepared architectural scene. Devices are supplied separately from viewport-filtered plan geometry and rendered by one deck.gl `IconLayer`; there is no React or DOM node per device.

## Backend

- Implemented `GET /api/v1/catalog?buildingId&floorIds` using the Stage 1 runtime contract.
- The server loads and validates the checked-in 18,000-device gzip catalog once at process startup.
- A floor-scoped request returns only that floor metadata and its devices; Level 1 returns exactly 2,900 records.
- Unknown buildings/floors and invalid queries are rejected.
- Stable responses expose `ETag`, `Cache-Control`, and support `If-None-Match` with `304`.
- The Level 1 JSON response is 2,178,593 bytes before HTTP content encoding. It is loaded once as stable metadata, not on every viewport update.

## Renderer

- Added a same-origin SVG texture atlas with eight icon families.
- A single instanced `IconLayer` maps all device types to atlas regions and category colors.
- Icon size is 7 px at the fitted view, 10 px at standard zoom, and 14 px at detail zoom.
- Floor polygons/paths and devices remain separate layers and update at different cadences.
- Architectural layers are excluded from the pick buffer because they currently have no selection behavior.
- Device selection uses `DeckGLRef.pickObject()` against only `floor-devices`, with a 4 px pick radius.
- The selected device is highlighted and represented by one React card with identity, protocol, provenance, position, and capability counts.

## State boundary

Only stable `DeviceMetadata` is loaded. Telemetry, connection, warning/critical status, alarms, and commands are not added to catalog objects. Selection is a single UI state reference; no complete device array is recreated for a selection change.

## Verification

| Check | Result |
|---|---|
| Runtime and generated schema freshness | Passed |
| Eight floor scenes | Passed, 3,680 features |
| Representative/stress catalogs | Passed, 18,000 / 50,000 devices |
| Unit/API/contract tests | 15 of 15 passed |
| Level 1 catalog contract | Passed, 2,900 devices |
| ETag / conditional request | Passed |
| TypeScript strict typecheck | Passed |
| Production build and smoke | Passed, including floor-scoped catalog |
| Chromium E2E | Passed: layer count, zoom, GPU picking, card close |

The browser test also asserts fewer than 200 DOM elements while 2,900 devices are present, protecting against accidental per-device JSX.

## Deferred

- Floor switching and building overview belong to Stage 4.
- Filters, search, status-aware LOD, and labels belong to later approved scope.
- Hot telemetry and dirty GPU attribute updates begin in Stage 5.
- Formal frame-time, memory, mobile, and 50,000-device benchmarks remain Stage 10 work.
