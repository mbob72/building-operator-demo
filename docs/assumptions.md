# Assumptions

## A-001 Device dataset size

The representative fixture contains exactly 18,000 devices after explicit Stage 2 approval. This is a reproducibility target, not a production capacity limit. A separate 50,000-device fixture remains the stress-test target; toy-scale (~2,000) and excessive (~200,000) fixtures are not representative acceptance datasets.

Approved representative distribution:

- 7,000 DALI lighting devices;
- 3,200 KNX presence, temperature, and CO₂ sensors;
- 1,400 KNX switches and actuators;
- 2,600 fire, sprinkler, and security devices;
- 2,200 HVAC/Modbus devices;
- 800 meters and electrical controllers;
- 800 access and other devices.

## A-002 Stage 0 floor geometry

Stage 0 uses a real horizontal section of the West Riverside Hospital architectural IFC2x3 model. The section plane is 1.2 metres above Level 1 and includes walls, columns, doors, windows/curtain walls, and stairs. Because the model has no useful `IfcSpace` collection, rooms are not named or inferred.

## A-003 Scene coordinate system

Scene coordinates are Cartesian metres with the positive Y axis pointing upward. The IFC world coordinates are normalized to a local Level 1 origin during offline extraction.

## A-004 Scene delivery protocol

Stage 0 uses a JSON viewport query. This is a replaceable boundary. Vector tiles, cached spatial chunks, or another protocol can be selected after measuring real extracted geometry.

## A-005 Backend implementation

The prototype backend uses Node.js, TypeScript, and Fastify to share contracts with the frontend. This does not define the production backend technology.

## A-006 Catalog delivery

The MVP initially transfers the stable catalog as one versioned document for the selected building or floors. Tens-of-thousands-scale metadata is expected to be cacheable and compressible. Pagination or binary encoding is added only if data-stage measurements justify it.

## A-007 Actor identity

Production authentication and authorization are out of scope. `requestedBy`, `acknowledgedBy`, and `confirmedBy` contain explicit mock actor IDs and must not be treated as trusted identity claims.

## A-008 Realtime ordering

Realtime sequence numbers are monotonically increasing within one building stream. A changed `streamId` means the previous cursor cannot be assumed valid and requires an authoritative snapshot.

## A-009 Snapshot authority

The HTTP hot-state snapshot is authoritative for telemetry, alarms, commands, and the realtime cursor. It atomically replaces those stores; it does not repeat stable catalog metadata or plan geometry.

## A-010 Command execution

All MVP commands are simulated. Backend command state and actual telemetry are separate, and an `executed` command does not by itself prove that the requested physical value is currently observed.

## A-011 Binding safety

A device binding is an opaque adapter or simulator reference with explicit provenance. It contains no credentials. Synthetic references remain marked `synthetic` and are never presented as addresses extracted from IFC.

## A-012 Wire timestamps and nullable fields

Wire timestamps use ISO 8601 strings with an explicit UTC offset. Lifecycle audit fields use explicit `null` before they occur, producing stable object shapes for snapshots and upserts.

## A-013 MEP source schema

Stage 2 uses IFC2X3 for Electrical, Fire Alarm, Mechanical, and Sprinklers. The dataset model card reports that several useful MEP property sets were lost in the IFC4 conversion. Every downloaded source is SHA-256 verified.

## A-014 Device provenance

IFC-origin devices retain source file, IFC class, numeric entity ID, and GlobalId. Their operational binding remains explicitly simulated and synthetic. Missing categories are generated with a fixed seed and never presented as IFC-derived protocol addresses.

## A-015 Simplified base floor geometry

The convex hull of all prepared architectural feature coordinates is an intentionally simplified base footprint, not an exact room, façade, or navigable-area boundary. It exists to preserve floor context across the supported LOD range and is replaceable by a higher-fidelity footprint without changing the scene API, provided one full-range `floor-shell` continues to cover every prepared feature bbox.

## A-016 Building-scoped realtime cursor

Stage 5 uses one monotonically increasing stream and replay cursor for the whole building. The frontend therefore bootstraps the complete building hot snapshot even while the stable catalog is floor-scoped. The server sends complete building batches rather than removing events for unselected floors, because filtering a globally sequenced batch would create false gaps. A future per-floor sharding design must introduce independent stream IDs/cursors instead of reusing this global sequence.
