# Product specification

## Product outcome

Building Operator MVP is a 2D operator workstation for monitoring and simulated control of engineering systems in a large building. It is not a BIM editor and never connects a browser directly to KNX, DALI, Modbus, BACnet, fire, security, or access-control networks.

The primary user is an operator who must understand current state, find abnormal equipment, acknowledge alarms, and issue auditable simulated commands without losing context during high update rates or reconnects.

## Product scale

- The representative fixture is in the tens-of-thousands range; the exact count is selected during the data stage.
- A 50,000-device fixture is reserved for stress testing.
- Floor mode is expected to show roughly 1,000–3,000 devices.
- Building overview shows the complete representative fixture.
- The source building is West Riverside Hospital. `floorId` is mandatory; `roomId` may be absent.

## Operator workflows

### Monitor a floor

1. Select a floor and receive its stable device catalog plus viewport-aware plan geometry.
2. Pan and zoom without converting devices into DOM nodes.
3. Filter by type, protocol, connection, and operational status.
4. Select a device and inspect metadata, current telemetry, alarms, and recent commands.

### Triage an alarm

1. See warning and critical state regardless of plan label LOD.
2. Navigate from an alarm to the device on its floor.
3. Acknowledge the alarm with operator identity and timestamp.
4. Keep acknowledged and resolved states distinct from active state.

### Issue a command

1. Create a local `draft` from a device capability.
2. Confirm the action when the capability marks it as requiring confirmation.
3. Submit an idempotent request and display `pending`.
4. Show backend `accepted`, then terminal `executed`, `failed`, or `timedOut`.
5. Keep desired command intent separate from actual telemetry; execution does not imply that telemetry already reflects the result.

### Recover realtime state

1. Apply ordered, batched realtime events to indexed hot state.
2. On reconnect, request replay after the last applied sequence.
3. If replay is unavailable or the stream changed, replace hot state with an authoritative HTTP snapshot.
4. Resume deltas after the snapshot sequence without treating a connection indicator as proof of state freshness.

## MVP boundaries

Included in the complete MVP:

- 2D floor and building-overview modes.
- Stable device metadata, hot telemetry, alarms, and simulated commands.
- Search, filters, picking, alarm navigation, acknowledgement, reconnect, and resync.
- Reproducible offline IFC/data preparation and explicit `dataOrigin`.
- Mock REST/WebSocket backend and load simulator.

Excluded:

- 3D BIM viewing, IFC parsing in the browser, CAD editing, and room inference.
- Production authentication, authorization, audit retention, or persistent operational storage.
- Direct physical-protocol connectivity or real equipment commands.
- Physical simulation of lighting, HVAC, fire, or security systems.
- Treating a synthetic binding as an IFC-derived or physical-system address.

## Safety and domain invariants

- Device IDs, alarm IDs, command IDs, client request IDs, and stream sequence numbers are stable and opaque.
- Stable device metadata never contains hot `status` or mutable telemetry values.
- A binding contains a protocol reference and provenance, never credentials.
- `draft` exists only in UI state. A backend command begins at `pending`.
- Repeating `clientRequestId` is idempotent and must not create a second command.
- Alarm acknowledgement and terminal command transitions carry auditable timestamps and actor/error data.
- Older device revisions and duplicate stream sequences are ignored; gaps trigger replay or snapshot resync.

## Stage 0 result

Stage 0 delivered and deployed the viewport-aware architectural scene without devices. Its scene API remains an independent contract.

## Stage 1 scope and acceptance

Stage 1 defines contracts; it does not add device rendering, simulator traffic, alarm UI, or command UI.

1. Operator workflows and MVP boundaries are explicit.
2. Building, floor, device, telemetry, alarm, and command entities have runtime-validatable contracts.
3. Stable metadata, hot operational state, and UI-only state have separate ownership.
4. REST payloads cover catalog, authoritative snapshot, alarm acknowledgement, command creation, and command lookup.
5. Realtime payloads cover subscription, ordered batches, resume, heartbeat, and explicit resync fallback.
6. JSON Schema is generated from the runtime contracts and checked in CI.
7. Contract tests cover lifecycle invariants, state separation, event ordering, and snapshot fallback.
8. No task from Stage 2 or later begins without separate approval.
