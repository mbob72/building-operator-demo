# Building operator MVP

Stage 0 proves viewport-aware scene delivery for real West Riverside Hospital geometry. Stage 1 defines product and operational contracts. Stage 2 adds eight architectural floors, a representative 18,000-device catalog, and a 50,000-device stress fixture. Stage 3 renders a one-floor device slice. Stage 4 adds floor/building modes, filters and renderer LOD. Stage 5 adds an authoritative snapshot, ordered WebSocket telemetry, replay/resync, selective hot-state subscriptions and dirty GPU updates. Stage 6 adds alarm lifecycle and the shared 19-type visual language. Stage 7 adds idempotent simulated commands, confirmation for critical capabilities, realtime lifecycle, and explicit desired/backend/actual state separation.

Current status: combined Stage 8–9 is complete and accepted; Stage 10 has not started.

## Run

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open <http://127.0.0.1:5173>. The scene API listens on <http://127.0.0.1:3001>.

## Verify

```bash
npm run verify
npm run test:e2e
```

Runtime Zod contracts live in `src/shared`. Generate or check the backend-independent Draft 2020-12 schemas with:

```bash
npm run contracts:generate
npm run contracts:check
```

See [`docs/product.md`](docs/product.md), [`docs/architecture.md`](docs/architecture.md), [`docs/architecture-todo.md`](docs/architecture-todo.md), [`docs/frontend-architecture.md`](docs/frontend-architecture.md), [`docs/frontend-data-consumption.md`](docs/frontend-data-consumption.md), the Confluence-oriented [`docs/realtime-data-flow-confluence.md`](docs/realtime-data-flow-confluence.md), [`docs/realtime-client-and-hot-store.md`](docs/realtime-client-and-hot-store.md), [`docs/backend-architecture.md`](docs/backend-architecture.md), and the stage reports through [`reports/stage-eight-nine.md`](reports/stage-eight-nine.md).

## Production mode

The production server serves both the built frontend and `/api/*` from one origin:

```bash
npm run build
NODE_ENV=production HOST=127.0.0.1 PORT=4174 npm start
```

Open <http://127.0.0.1:4174>. `npm run verify` includes a production smoke test for the HTML entry point and viewport scene API.

## Live demo

Open the public building operator demo at <https://building-operator-demo.onrender.com>.

The repository includes a Render Blueprint in `render.yaml` and GitHub Actions in `.github/workflows/ci.yml`. Render is configured to deploy the `main` branch only after CI checks pass. See [`docs/deployment.md`](docs/deployment.md).

## Stage 0 architecture

The browser converts the current orthographic view to a world-coordinate bounding box and sends it with the current zoom to `POST /api/scene/query`. The API filters floor geometry by bbox and feature zoom range. Panning or zooming triggers a debounced request and replaces the WebGL layers with the returned scene subset.

The browser does not parse IFC. The checked-in compact scene was produced offline from `arc_ifc2x3.ifc` using a horizontal section 1.2 metres above Level 1. It contains walls, columns, doors, windows/curtain walls, and stairs where they intersect the section.

## Reproduce the offline data

The source IFC is about 80 MB and is excluded from version control. Python 3.11 is recommended because binary IfcOpenShell wheels are available for it.

```bash
python3.11 -m venv .venv
.venv/bin/pip install -r requirements-data.txt
scripts/data-pipeline/download-west-riverside.sh
npm run data:floor
```

The source model is West Riverside Hospital from IFC-Bench/OpenIFC Model Repository and is licensed under CC BY 3.0. The downloaded source checksum and attribution files live under `data/source`.

Generate and validate the full Stage 2 dataset with:

```bash
npm run data:floors
npm run data:devices
npm run data:stress
npm run data:validate
npm run data:reproducibility
```

The representative fixture contains exactly 18,000 devices using seed `20260807`; this is a reproducibility target, not a product capacity limit. The stress fixture contains 50,000 devices. Both catalogs combine provenance-preserving IFC elements with explicitly marked synthetic devices.
