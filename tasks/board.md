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
- [ ] Extract all architectural floors and LOD metadata.
- [ ] Preserve IFC provenance and normalize real device coordinates by floor.
- [ ] Generate missing categories deterministically with a fixed seed.
- [ ] Validate the catalog against runtime contracts and data-quality invariants.
- [ ] Produce the 50,000-device stress fixture.
- [ ] Write the data-quality report and reproducibility instructions.
- [ ] Run full Stage 2 verification.
- [ ] Present Stage 2 for approval.

## Later stages

Blocked until explicit user approval. No task from Stage 3 or later may be started as part of Stage 2 cleanup.
