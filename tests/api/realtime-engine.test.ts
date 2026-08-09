import { describe, expect, it, vi } from 'vitest';
import { EventBatchMessageSchema } from '../../src/shared/realtime-contracts';
import { RealtimeEngine } from '../../src/server/realtime-engine';
import { initialTelemetry } from '../../src/server/state-snapshot';

const now = () => new Date('2026-08-09T12:00:00.000Z');

describe('RealtimeEngine', () => {
  it('publishes one contiguous batch and exposes the update in an authoritative snapshot', () => {
    const engine = new RealtimeEngine({ streamId: 'stream-test', now });
    const current = initialTelemetry[0]!;
    const listener = vi.fn();
    engine.subscribe(listener);

    const batch = engine.publishTelemetryPatches([
      {
        deviceId: current.deviceId,
        revision: current.revision + 1,
        observedAt: now().toISOString(),
        receivedAt: now().toISOString(),
        values: { test: 42 },
      },
      {
        deviceId: initialTelemetry[1]!.deviceId,
        revision: initialTelemetry[1]!.revision + 1,
        observedAt: now().toISOString(),
        receivedAt: now().toISOString(),
        values: { test: 43 },
      },
    ]);

    expect(EventBatchMessageSchema.parse(batch).events).toHaveLength(2);
    expect(batch?.fromSequence).toBe(1);
    expect(batch?.toSequence).toBe(2);
    expect(listener).toHaveBeenCalledOnce();
    expect(engine.latestSequence).toBe(2);
    expect(engine.snapshot(['west-riverside-level-1']).sequence).toBe(2);
    expect(engine.getTelemetry(current.deviceId)?.values.test).toBe(42);
  });

  it('ignores stale per-device revisions without consuming a stream sequence', () => {
    const engine = new RealtimeEngine({ streamId: 'stream-test', now });
    const current = initialTelemetry[0]!;

    expect(engine.publishTelemetryPatches([{
      deviceId: current.deviceId,
      revision: current.revision,
      observedAt: now().toISOString(),
      receivedAt: now().toISOString(),
      status: 'critical',
    }])).toBeUndefined();
    expect(engine.latestSequence).toBe(0);
    expect(engine.getTelemetry(current.deviceId)).toEqual(current);
  });

  it('retains a bounded replay window and detects an expired cursor', () => {
    const engine = new RealtimeEngine({
      streamId: 'stream-test',
      replayLimit: 2,
      now,
    });
    const current = initialTelemetry[0]!;
    for (let revision = 2; revision <= 4; revision += 1) {
      engine.publishTelemetryPatches([{
        deviceId: current.deviceId,
        revision,
        observedAt: now().toISOString(),
        receivedAt: now().toISOString(),
        values: { revision },
      }]);
    }

    expect(engine.retentionStartSequence).toBe(2);
    expect(engine.replayAfter(0)).toBeUndefined();
    expect(engine.replayAfter(1)?.map((event) => event.sequence)).toEqual([2, 3]);
    expect(engine.replayAfter(3)).toEqual([]);
  });

  it('coalesces a 1,000-event simulator burst into one listener notification', () => {
    const engine = new RealtimeEngine({ streamId: 'stream-test', now });
    const listener = vi.fn();
    engine.subscribe(listener);

    const batch = engine.generateSimulatorBatch(1_000);

    expect(batch?.events).toHaveLength(1_000);
    expect(listener).toHaveBeenCalledOnce();
  });
});
