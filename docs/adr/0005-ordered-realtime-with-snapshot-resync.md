# ADR-0005: Ordered realtime batches with HTTP snapshot resync

- Status: accepted
- Date: 2026-08-07

## Context

The mock transport must support normal traffic, bursts, disconnects, reconnects, and authoritative recovery. WebSocket delivery alone does not prove that a client has every event, and replay retention is necessarily finite. Sending a large full snapshot inside every WebSocket reconnect also complicates backpressure and transport recovery.

## Decision

1. Use a building-scoped `streamId` and monotonically increasing sequence number.
2. Deliver telemetry patches and alarm/command upserts in contiguous `event.batch` messages.
3. Track an additional monotonic revision per device telemetry record.
4. Use an HTTP `StateSnapshot` as the authoritative full hot-state replacement.
5. Resume after the last applied sequence when the cursor is retained.
6. Return `resync.required` when the cursor expired, the stream changed, or the server restarted; the client then fetches a snapshot and resumes after its sequence.
7. Ignore duplicates, reject gaps, and never infer missing state.

## Consequences

- Reconnect behavior is deterministic and testable.
- High-rate telemetry remains batchable while low-volume alarms and commands use complete-record upserts.
- Snapshot and delta application need an atomic boundary in the hot store.
- The simulator must retain a bounded replay window; its exact duration is selected with load measurements.
- Stable metadata invalidation is a separate realtime event and is not embedded in the hot snapshot.
