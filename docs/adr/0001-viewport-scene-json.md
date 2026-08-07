# ADR-0001: Viewport-aware JSON scene query

- Status: accepted for Stage 0
- Date: 2026-08-07

## Context

The operator UI must navigate large 2D floor scenes. Before choosing a production tiling scheme, the client/server responsibility boundary needs to be exercised.

## Decision

Use `POST /api/scene/query` with a floor ID, world-coordinate bbox, pixel dimensions, and continuous zoom. Return a JSON feature collection already filtered by viewport and feature zoom range.

Use a deck.gl orthographic view on the client. Keep feature representation independent of React components.

## Consequences

- The API behavior is straightforward to inspect and test.
- The same contract is backed by an offline IFC pipeline and can later be backed by indexed scene chunks.
- Linear scanning and JSON encoding are not assumed to be production-ready.
- Real-geometry measurements may lead to vector tiles or indexed scene chunks in a later ADR.
