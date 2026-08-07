# ADR-0002: Rendering tens of thousands of devices

- Status: accepted as implementation guardrails
- Date: 2026-08-07

## Context

The operator scene will contain a representative tens-of-thousands-scale device dataset with realtime status changes. It must remain interactive in floor and building-overview modes. The precise device count is not a contractual constant, and optimizations must not be justified only by a round number.

## Decision

1. Render devices with deck.gl `IconLayer` instancing and a texture atlas.
2. Keep devices out of the React DOM and keep the WebGL subsystem independent of component structure.
3. Begin by rendering the relevant device population without mandatory CPU viewport culling. Use deck.gl GPU picking.
4. Store stable metadata separately from hot telemetry. Apply coalesced telemetry batches to dirty GPU attributes at a controlled cadence.
5. Use LOD primarily for plan detail and labels. Alarm visibility must survive clustering or LOD decisions.
6. Add quadtree/R-tree indexing only for measured spatial-query or scale needs. `rbush` is the initial candidate for mixed bounding-box data.
7. Decide whether to add clustering, workers, binary attributes, or further culling from reproducible benchmarks on target hardware.

## Consequences

- The initial implementation remains small and lets the GPU handle the workload it is designed for.
- Realtime-store and layer-update design become more important than React list optimization.
- Server viewport filtering remains useful for complex floor geometry and future large spatial datasets.
- Later optimization work requires before/after measurements in `reports/performance.md`.
- The benchmark must cover a 50,000-device stress fixture even if the representative product fixture is smaller.

## Supporting guidance

See [`docs/rendering-guidelines.md`](../rendering-guidelines.md).
