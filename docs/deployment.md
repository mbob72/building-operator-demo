# Live demo deployment

## Target

The live demo runs as one Render Web Service connected to the GitHub `main` branch:

```text
Browser
  -> Render HTTPS origin
       -> Fastify API (/api/*)
       -> Vite production files (/*)
       -> WebSocket simulator (/api/v1/realtime)
```

The service is configured by `render.yaml`. GitHub Actions must pass before Render deploys a commit.

Public URL: <https://building-operator-demo.onrender.com>.

## Local production verification

```bash
npm ci
npm run verify
```

To run the production server manually:

```bash
npm run build
NODE_ENV=production HOST=127.0.0.1 PORT=4174 npm start
```

Open <http://127.0.0.1:4174>.

## GitHub setup

1. Use the public repository `mbob72/building-operator-demo`.
2. Push the local `main` branch.
3. Confirm that the `verify` and `e2e` GitHub Actions jobs pass.
4. Protect `main` if the repository workflow requires pull requests.

## Render setup

1. In Render, create a new Blueprint.
2. Connect the GitHub repository.
3. Select the root `render.yaml`.
4. Confirm the service name and free/paid plan.
5. Allow the first deployment to wait for GitHub checks.
6. Verify `/api/health`, `/api/floors`, `/api/scene/query`, `/api/v1/state/snapshot`, `/api/v1/realtime`, command creation, and the browser viewer.

No secret environment variables are required for the current Stage 7 demo.

## Demo safety

- Deploy only public, attributed, or synthetic data.
- Never add KNX, DALI, Modbus, BACnet, or other physical-system credentials.
- Keep command execution simulated.
- Keep the visible `OPERATOR DEMO` marker while simulated command controls are available.
- Treat the Render filesystem and in-memory simulator state as ephemeral.

## Operational limitations

- A free service can have a cold-start delay after inactivity.
- A redeploy or restart can interrupt WebSocket connections.
- Clients must reconnect and request a fresh snapshot.
- The source IFC is intentionally excluded from the deployment.
