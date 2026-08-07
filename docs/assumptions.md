# Assumptions

## A-001 Device dataset size

The future dataset is representative rather than exactly 20,000 devices. It should be in the tens-of-thousands range and must avoid toy-scale (~2,000) and excessive (~200,000) fixtures. The exact target will be chosen during the data stage and approved separately.

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
