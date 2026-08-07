# ADR-0004: Separate stable metadata, hot operational state, and UI state

- Status: accepted
- Date: 2026-08-07

## Context

The application will render a tens-of-thousands-scale device catalog while processing hundreds to thousands of updates per second. A convenient array of combined device objects would force unchanged names, positions, bindings, and capabilities to be recreated whenever status or a telemetry value changes. It would also couple React rendering to the WebGL update cadence.

## Decision

Use separate canonical state classes:

1. Stable catalog metadata is a versioned server document cached by query key and `catalogVersion`.
2. Telemetry, alarms, commands, and stream cursor are kept in indexed hot stores and replaced atomically by a state snapshot.
3. Selection, filters, viewport, panels, and command drafts are UI-only state.
4. The WebGL adapter joins stable device order with hot visual attributes and updates dirty indices at a controlled cadence.
5. Transport payloads use arrays; frontend ingestion creates maps/indexes rather than requiring backend-specific dictionary shapes.

Dynamic `status` is part of `DeviceTelemetry`, not `DeviceMetadata`. `draft` is part of UI state, not a backend command record.

## Consequences

- A device telemetry change does not invalidate the catalog or recreate all device objects.
- React panels can subscribe to narrow selectors while deck.gl receives independent batched updates.
- Snapshot/resync can replace hot state without redownloading plan geometry or metadata.
- Consumers must explicitly join metadata and current state by `deviceId`.
- Store implementation libraries remain deferred until the relevant implementation stage.
