# Stage 0 verification report

Date: 2026-08-07

## Delivered

- Runtime-validated viewport scene contract.
- Floor list and viewport scene endpoints.
- Server-side bbox intersection and zoom-based LOD.
- Real West Riverside Hospital Level 1 geometry with no devices.
- Reproducible IFC-to-2D horizontal-section pipeline.
- Prepared scene: 1,062 features (473 wall sections, 147 columns, 303 window/curtain-wall sections, and 139 door sections).
- Orthographic deck.gl viewer with pan, zoom, fit, and request diagnostics.

## Checks

- TypeScript strict type checking: passed.
- API and viewport unit tests: 6 passed.
- Chromium E2E: 1 passed.
- Production build: passed.
- Dependency audit during install: 0 vulnerabilities.

## Known limitations

- Only Level 1 architecture is currently extracted; other floors and disciplines are out of scope for Stage 0.
- Rooms are not labelled because the source model has no useful `IfcSpace` entities; automatic room inference is outside MVP scope.
- The backend performs a linear feature scan; no spatial index is justified yet.
- JSON transport has not been compared with vector tiles using representative BIM geometry.
- The initial deck.gl production JavaScript chunk is approximately 969 kB minified / 285 kB gzip and has not yet been code-split.
- Full-building performance benchmarking belongs to a later approved stage.
