# ADR-0006: Reproducible mixed-origin device dataset

- Status: accepted
- Date: 2026-08-07

## Context

The source IFC disciplines contain useful real MEP elements, but not every product category and floor required by the operator MVP. Treating generated devices as IFC-derived would make the demo misleading. Allowing timestamps, gzip headers, or random placement to vary would also prevent reliable checks and performance comparisons.

## Decision

1. Preserve every included IFC device's source file, global ID, IFC type, numeric IFC ID, floor, and normalized position.
2. Mark every device as `ifc`, `derived`, or `synthetic`; require runtime consistency between `dataOrigin` and provenance.
3. Keep operational bindings simulated until a physical integration exists, regardless of metadata origin.
4. Use `ObjectPlacement` when it falls inside the architectural floor bounds; retry rejected placements with the world-space geometry centroid.
5. Exclude candidates still outside the prepared floor bounds and record deterministic reason counts in the manifest.
6. Fill approved category and floor targets with a fixed seed and deterministic ordering.
7. Fix dataset time and gzip metadata, publish raw/compressed checksums, and require byte-for-byte regeneration.
8. Keep 18,000 as the representative fixture and 50,000 as a separate stress fixture; neither value is a product capacity limit.

## Consequences

- The UI can explain whether a device came from IFC or was synthesized without inventing physical connectivity.
- Regeneration and CI validation detect accidental source, schema, distribution, or serialization changes.
- Some valid IFC geometry can be omitted when it lies outside the prepared architectural bounds; manifests and the data-quality report make this visible.
- Room assignment remains unknown until a separate spatial-containment step is implemented.
