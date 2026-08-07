# Product specification

## Stage 0 goal

Prove that the backend can deliver a 2D floor scene based on floor, viewport, and zoom, and that the frontend can navigate that scene using pan and zoom.

## Included

- Real Level 1 architectural geometry from West Riverside Hospital.
- Scene query by `floorId`, world-coordinate bbox, viewport dimensions, and zoom.
- Server-side bbox filtering and zoom-dependent level of detail.
- Orthographic WebGL viewer.
- Pan, wheel zoom, zoom controls, and fit-to-floor.
- Visible diagnostics showing zoom band and returned feature count.

## Excluded

- Devices and device count decisions.
- Other floors and non-architectural IFC disciplines.
- Telemetry, WebSocket transport, alarms, and commands.
- Authentication and production persistence.
- Production vector-tile protocol or spatial database.

## Acceptance criteria

1. The API validates the scene query.
2. An unknown floor returns 404.
3. Features outside the viewport are not returned.
4. Additional detail appears at a higher zoom.
5. The browser displays one floor without devices.
6. Dragging and zooming change the requested viewport.
7. The floor can be reset to a fitted view.
8. Type checking, unit tests, and production build pass.
