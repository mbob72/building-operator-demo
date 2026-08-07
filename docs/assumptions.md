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
