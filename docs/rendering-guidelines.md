# Rendering guidelines for large object counts

Source reviewed: [shared ChatGPT discussion](https://chatgpt.com/share/6a760c62-6c9c-83eb-a93e-714ecebd57e0), 2026-08-07.

These are project guardrails, not assumptions that every optimization is needed. Each optimization must address a measured bottleneck on representative data and target hardware.

## Core model

- React owns the application shell: navigation, filters, panels, selected entity, alarms, and commands.
- deck.gl owns the graphical scene. A device must not become a React or DOM node.
- The floor plan, devices, labels, selection, zones, and relationships are separate render layers.
- Static entity metadata and hot telemetry are separate data structures.
- The renderer consumes prepared scene data and domain-level device state, never raw IFC or protocol-specific payloads.

## Device rendering

- Start with one deck.gl `IconLayer` for the relevant device population and use its instanced rendering.
- Use one texture atlas with a unique slot for every contract `DeviceType`, rather than separate image elements or draw calls per icon.
- Derive both deck.gl `iconMapping` and React marker background positions from the same ordered type list; filters, cards and the map must never maintain independent type-to-glyph tables.
- Keep the number of layers/draw calls small. Split layers only when visual behavior or update cadence differs materially.
- Use GPU picking for ordinary point selection.
- Do not introduce per-device event handlers or JSX.
- Do not recreate the complete device object array for a single telemetry change.
- Prefer stable device ordering and update only dirty visual attributes such as color, size, state, or icon index.

Tens of thousands of simple icons are expected to be a normal WebGL workload. The actual limits must be measured; object count alone is not evidence that clustering or CPU culling is required.

## Realtime updates

The intended flow is:

```text
WebSocket deltas
    -> indexed hot store by deviceId
    -> dirty-device queue
    -> update batch at controlled frame cadence
    -> changed GPU attributes
```

- Never trigger one React render per telemetry message.
- Coalesce repeated updates for the same device within a batch.
- Apply updates at a controlled cadence, initially aligned with animation frames and capped when necessary.
- Keep initial snapshot/resync separate from incremental deltas.
- Measure serialization, queue depth, batch application time, GPU attribute upload time, dropped frames, and end-to-end telemetry latency.
- Consider a Web Worker only when profiling shows that clustering, indexing, decoding, or filtering blocks the main thread.

## Viewport and level of detail

- Keep server-side viewport and zoom filtering for floor geometry; complex plan geometry can be more expensive than device icons.
- Show labels only for selected, alarming, or sufficiently zoomed-in devices.
- At low zoom, reduce label and plan detail before reducing device availability.
- Clustering is a product representation decision as well as an optimization. It must preserve visibility of warnings and critical alarms.
- Filters by floor and system are valid product behavior and should also reduce rendering work.

## Spatial indexing

Do not require a spatial index merely to draw a tens-of-thousands-scale point layer. First benchmark rendering all relevant device instances.

Use a spatial index when it materially improves:

- nearest-device queries;
- area or rectangle selection;
- room/zone queries;
- label placement;
- neighbor lookup;
- custom clustering;
- mixed-size geometry;
- datasets growing toward hundreds of thousands of objects.

Preferred shapes:

- quadtree for predominantly point-like devices and nearest-neighbor lookup;
- R-tree for bounding boxes, rooms, zones, routes, labels, and equipment with size;
- `rbush` is the first library candidate for an R-tree implementation.

The index may operate on the full stable metadata set while the GPU continues to render all relevant instances. Rendering culling and spatial-query acceleration are separate decisions.

## Benchmark scenarios

Before accepting the device-rendering stage, measure at least:

1. Representative datasets in the tens-of-thousands range, plus a 50,000-device stress fixture.
2. Floor mode and all-building overview.
3. Continuous zoom and pan.
4. GPU picking and repeated pointer movement.
5. Filters and selection changes.
6. Normal realtime load and burst load.
7. Alarm color/size changes.
8. Labels disabled, LOD-controlled, and worst-case enabled.
9. Reconnect followed by full snapshot/resync.
10. A low-end supported desktop and a representative mobile browser.

Record frame time percentiles rather than only average FPS. Also record long tasks, memory, React commit counts, number of rendered instances, and update latency.

## Avoided premature optimizations

- Do not assume Electron or another desktop wrapper makes browser rendering faster.
- Do not add clustering solely because the dataset has tens of thousands of devices.
- Do not add a Web Worker before identifying main-thread work worth moving.
- Do not force all scene geometry into a single layer when layers have different LOD or update cadence.
- Do not load or parse IFC at runtime in the browser.
