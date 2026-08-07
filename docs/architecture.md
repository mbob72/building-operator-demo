# Stage 0 architecture

```text
Orthographic viewer
       |
       | floorId + bbox + zoom + pixel size
       v
POST /api/scene/query
       |
       +-- request validation
       +-- floor lookup
       +-- bbox intersection
       +-- zoom-range filtering
       v
Scene response -> PolygonLayer / PathLayer / TextLayer
```

## Boundaries

- `src/shared`: runtime-validatable transport contracts.
- `src/server`: prepared-scene loading, spatial filtering, HTTP endpoints.
- `scripts/data-pipeline`: reproducible IFC download and horizontal-section extraction.
- `data/generated`: compact browser-independent scene artifact.
- `src/client`: view state, viewport conversion, API client, WebGL layers.
- `contracts`: backend-independent JSON Schema representation.

## Request lifecycle

The viewer maintains an orthographic `target` and `zoom`. It derives the visible bbox from target, viewport dimensions, and scale. View changes are debounced for 100 ms. The server returns only features whose bbox intersects the requested bbox and whose zoom range contains the requested zoom.

The 1,062 prepared features are currently scanned linearly. A spatial index is intentionally deferred until all selected floors and disciplines exist and can be benchmarked together.

## Large object rendering

Device rendering and realtime update guardrails are defined in [`rendering-guidelines.md`](rendering-guidelines.md) and [ADR-0002](adr/0002-many-object-rendering.md). In particular, spatial indexing, clustering, workers, and CPU viewport culling are benchmark-driven additions rather than mandatory prerequisites for a tens-of-thousands-scale instanced point layer.
