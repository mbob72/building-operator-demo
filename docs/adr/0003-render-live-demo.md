# ADR-0003: Render-hosted live demo

- Status: accepted
- Date: 2026-08-07

## Context

The live demo must be deployed from GitHub while preserving the Stage 0 viewport-aware backend and leaving a direct path to the planned WebSocket simulator. GitHub Pages cannot execute the Fastify server, and splitting frontend and backend would introduce CORS and two deployment lifecycles.

## Decision

Deploy one Node.js Render Web Service from the GitHub `main` branch.

- Fastify serves `/api/*`, the Vite production build, and later `/ws` from one origin.
- `render.yaml` defines the build, start, health check, environment, and deploy trigger.
- Render deploys only after GitHub CI checks pass.
- GitHub Actions runs type checks, unit/contract tests, a production smoke test, a production build, and Chromium E2E.
- Only prepared scene data is deployed; source IFC and local Python dependencies remain excluded.
- The demo contains simulated/public data only and never connects to physical equipment.

## Consequences

- The demo receives one HTTPS URL and requires no CORS configuration.
- Future WebSocket support stays in the same server process for the MVP.
- The free Render instance can sleep after inactivity, so the first request may have a cold-start delay.
- Runtime filesystem changes are not durable and must not be treated as application state.
- The public GitHub repository is created; creating the Render service remains an explicit external action performed from the verified Blueprint.
