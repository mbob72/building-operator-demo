# Sequential task board

## Stage 0 — viewport scene prototype

- [x] Define scope and acceptance criteria.
- [x] Define runtime and JSON contracts.
- [x] Implement floor and scene endpoints.
- [x] Implement bbox and zoom filtering.
- [x] Implement orthographic floor viewer.
- [x] Implement pan, zoom, fit, and diagnostics.
- [x] Install dependencies and run verification.
- [x] Run browser smoke test.
- [x] Capture large-object rendering and realtime-update guardrails.
- [x] Prepare GitHub Actions and Render live-demo configuration.
- [x] Create the approved public GitHub repository.
- [x] Create and verify the Render service from the committed Blueprint.
- [x] Present Stage 0 for approval.

## Stage 1 — product model and domain contracts

- [x] Confirm operator workflows and MVP boundaries.
- [x] Define building, floor, device, telemetry, alarm, and command entities.
- [x] Separate stable metadata, hot operational state, UI state, and renderer state.
- [x] Define REST catalog, snapshot, acknowledge, and command payloads.
- [x] Define ordered realtime batches, resume, heartbeat, and resync fallback.
- [x] Generate backend-independent JSON Schema from runtime contracts.
- [x] Add contract and lifecycle tests.
- [x] Record state-separation and realtime-recovery ADRs.
- [x] Run full Stage 1 verification.
- [x] Present Stage 1 for approval.

## Stage 2 — offline data pipeline

- [x] Approve a representative 18,000-device fixture and 50,000-device stress target.
- [x] Download and SHA-256 verify selected IFC2X3 MEP disciplines.
- [x] Audit storeys, classes, placements, and coordinate alignment.
- [x] Extract all architectural floors and LOD metadata.
- [x] Preserve IFC provenance and normalize real device coordinates by floor.
- [x] Generate missing categories deterministically with a fixed seed.
- [x] Validate the catalog against runtime contracts and data-quality invariants.
- [x] Produce the 50,000-device stress fixture.
- [x] Write the data-quality report and reproducibility instructions.
- [x] Run full Stage 2 verification.
- [x] Present Stage 2 for approval.

## Stage 3 — minimal device vertical slice

- [x] Load stable device metadata for one floor through the API.
- [x] Render one floor's devices with deck.gl `IconLayer` and a texture atlas.
- [x] Use GPU picking without per-device React/DOM components.
- [x] Open a card for the selected device.
- [x] Add API, UI, and browser tests for the vertical slice.
- [x] Run full Stage 3 verification.
- [x] Present Stage 3 for approval.
- [x] Receive explicit Stage 3 approval.

## Stage 4 — floor mode and building overview

- [x] Serve all eight prepared floors through floor and scene APIs.
- [x] Add floor switching while preserving independent scene/device data flows.
- [x] Add a side-by-side building overview with all floors and 18,000 devices.
- [x] Preserve pan, zoom, fit, and GPU picking in floor and overview modes.
- [x] Add plan, device-icon, and label LOD behavior.
- [x] Add search and filters by device type and protocol.
- [x] Add the approved Stage 4 status source and status filtering.
- [x] Keep warning/critical devices visible at every LOD.
- [x] Add API, UI, and browser coverage for floor/overview workflows.
- [x] Update frontend/backend architecture and Stage 4 report.
- [x] Run full Stage 4 verification.
- [x] Present Stage 4 for approval.
- [ ] Receive explicit Stage 4 approval.

## Stages 5–7

- [x] Complete and receive explicit approval for ordered realtime state (Stage 5).
- [x] Complete and receive explicit approval for alarms (Stage 6).
- [x] Complete and receive explicit approval for simulated commands (Stage 7).

## Combined Stage 8–9 — reliability and full-product automated acceptance

- [x] Receive explicit user approval to start combined Stage 8–9.
- [x] Define disconnect command safety and idempotent retry policy.
- [x] Harden duplicate, stale, gap, stream-change, and reconnect recovery.
- [x] Handle unknown devices and nullable `roomId` without corrupting UI state.
- [x] Preserve selection and operator state during alarm bursts.
- [x] Add command lookup fallback while realtime is unavailable.
- [x] Complete unit, contract, API, component, E2E, and DOM-cardinality coverage.
- [x] Update frontend/backend architecture and Stage 8–9 report.
- [x] Run full verification and browser acceptance.
- [x] Present combined Stage 8–9 and receive explicit approval.

## Later stages

Stage 10 performance work remains blocked until explicit approval after Stage 8–9.
