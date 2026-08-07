# Building operator MVP

Stage 0 proves a viewport-aware scene delivery contract and a browser viewer for the real Level 1 architectural geometry of West Riverside Hospital. Stage 1 adds the product model and backend-independent contracts for future devices, telemetry, alarms, commands, and realtime recovery; those operational features are not implemented yet.

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

See [`docs/product.md`](docs/product.md), [`docs/architecture.md`](docs/architecture.md), and [`reports/stage-one.md`](reports/stage-one.md) for the Stage 1 baseline.

## Production mode

The production server serves both the built frontend and `/api/*` from one origin:

```bash
npm run build
NODE_ENV=production HOST=127.0.0.1 PORT=4174 npm start
```

Open <http://127.0.0.1:4174>. `npm run verify` includes a production smoke test for the HTML entry point and viewport scene API.

## Live demo

Open the public Stage 0 demo at <https://building-operator-demo.onrender.com>.

The repository includes a Render Blueprint in `render.yaml` and GitHub Actions in `.github/workflows/ci.yml`. Render is configured to deploy the `main` branch only after CI checks pass. See [`docs/deployment.md`](docs/deployment.md).

## Stage 0 architecture

The browser converts the current orthographic view to a world-coordinate bounding box and sends it with the current zoom to `POST /api/scene/query`. The API filters floor geometry by bbox and feature zoom range. Panning or zooming triggers a debounced request and replaces the WebGL layers with the returned scene subset.

The browser does not parse IFC. The checked-in compact scene was produced offline from `arc_ifc2x3.ifc` using a horizontal section 1.2 metres above Level 1. It contains walls, columns, doors, windows/curtain walls, and stairs where they intersect the section.

## Reproduce the floor scene

The source IFC is about 80 MB and is excluded from version control. Python 3.11 is recommended because binary IfcOpenShell wheels are available for it.

```bash
python3.11 -m venv .venv
.venv/bin/pip install -r requirements-data.txt
scripts/data-pipeline/download-west-riverside.sh
npm run data:floor
```

The source model is West Riverside Hospital from IFC-Bench/OpenIFC Model Repository and is licensed under CC BY 3.0. The downloaded source checksum and attribution files live under `data/source`.
