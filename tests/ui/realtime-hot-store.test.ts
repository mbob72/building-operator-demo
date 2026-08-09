import { describe, expect, it, vi } from 'vitest';
import type { StateSnapshot } from '../../src/shared/api-contracts';
import { EventBatchMessageSchema } from '../../src/shared/realtime-contracts';
import { RealtimeHotStore } from '../../src/client/src/realtime-hot-store';
import { makeTelemetry } from './device-fixtures';

const timestamp = '2026-08-09T12:00:00.000Z';
const initialSnapshot = (): StateSnapshot => ({
  snapshotId: 'snapshot-1',
  buildingId: 'west-riverside',
  streamId: 'stream-1',
  sequence: 10,
  generatedAt: timestamp,
  telemetry: [makeTelemetry('device-1', 'normal'), makeTelemetry('device-2', 'warning')],
  alarms: [],
  commands: [],
});

const batch = (events: Array<{
  sequence: number;
  event: {
    type: 'telemetry.patch';
    payload: {
      deviceId: string;
      revision: number;
      observedAt: string;
      receivedAt: string;
      status?: 'normal' | 'warning' | 'critical' | 'offline' | 'unknown';
      connection?: 'online' | 'offline' | 'unknown';
      values?: Record<string, boolean | number | string | null>;
    };
  };
}>) => EventBatchMessageSchema.parse({
  type: 'event.batch',
  streamId: 'stream-1',
  emittedAt: timestamp,
  fromSequence: events[0]!.sequence,
  toSequence: events.at(-1)!.sequence,
  events,
});

describe('RealtimeHotStore', () => {
  it('atomically replaces all indexed hot state from a snapshot', () => {
    const store = new RealtimeHotStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.replaceSnapshot(initialSnapshot());

    const state = store.getSnapshot();
    expect(listener).toHaveBeenCalledOnce();
    expect(state.ready).toBe(true);
    expect(state.sequence).toBe(10);
    expect(state.telemetryByDeviceId.get('device-1')?.status).toBe('normal');
    expect(state.statusByDeviceId.get('device-2')).toBe('warning');
  });

  it('applies a contiguous multi-event batch with one notification', () => {
    const store = new RealtimeHotStore();
    store.replaceSnapshot(initialSnapshot());
    const listener = vi.fn();
    store.subscribe(listener);

    const result = store.applyBatch(batch([
      {
        sequence: 11,
        event: {
          type: 'telemetry.patch',
          payload: {
            deviceId: 'device-1',
            revision: 2,
            observedAt: timestamp,
            receivedAt: timestamp,
            values: { temperature: 22.4 },
          },
        },
      },
      {
        sequence: 12,
        event: {
          type: 'telemetry.patch',
          payload: {
            deviceId: 'device-2',
            revision: 2,
            observedAt: timestamp,
            receivedAt: timestamp,
            status: 'critical',
          },
        },
      },
    ]));

    expect(result).toBe('applied');
    expect(listener).toHaveBeenCalledOnce();
    expect(store.getSnapshot().sequence).toBe(12);
    expect(store.getSnapshot().telemetryByDeviceId.get('device-1')?.values.temperature).toBe(22.4);
    expect(store.getSnapshot().statusByDeviceId.get('device-2')).toBe('critical');
    expect(store.getSnapshot().dirtyStatusDeviceIds).toEqual(new Set(['device-2']));
  });

  it('ignores duplicate stream sequences and detects gaps or stream changes', () => {
    const store = new RealtimeHotStore();
    store.replaceSnapshot(initialSnapshot());
    const duplicate = batch([{
      sequence: 10,
      event: {
        type: 'telemetry.patch',
        payload: {
          deviceId: 'device-1', revision: 2, observedAt: timestamp, receivedAt: timestamp,
          values: { duplicate: true },
        },
      },
    }]);
    const gap = batch([{
      sequence: 12,
      event: {
        type: 'telemetry.patch',
        payload: {
          deviceId: 'device-1', revision: 2, observedAt: timestamp, receivedAt: timestamp,
          values: { gap: true },
        },
      },
    }]);

    expect(store.applyBatch(duplicate)).toBe('duplicate');
    expect(store.applyBatch(gap)).toBe('gap');
    expect(store.applyBatch({ ...gap, streamId: 'other-stream' })).toBe('stream-mismatch');
    expect(store.getSnapshot().sequence).toBe(10);
  });

  it('advances stream sequence while ignoring an older device revision', () => {
    const store = new RealtimeHotStore();
    store.replaceSnapshot(initialSnapshot());

    expect(store.applyBatch(batch([{
      sequence: 11,
      event: {
        type: 'telemetry.patch',
        payload: {
          deviceId: 'device-1', revision: 1, observedAt: timestamp, receivedAt: timestamp,
          status: 'critical',
        },
      },
    }]))).toBe('applied');
    expect(store.getSnapshot().sequence).toBe(11);
    expect(store.getSnapshot().telemetryByDeviceId.get('device-1')?.status).toBe('normal');
  });

  it('keeps renderer state stable for value-only telemetry batches', () => {
    const store = new RealtimeHotStore();
    store.replaceSnapshot(initialSnapshot());
    const before = store.getSnapshot();

    expect(store.applyBatch(batch([{
      sequence: 11,
      event: {
        type: 'telemetry.patch',
        payload: {
          deviceId: 'device-1', revision: 2, observedAt: timestamp, receivedAt: timestamp,
          values: { temperature: 24.2 },
        },
      },
    }]))).toBe('applied');

    const after = store.getSnapshot();
    expect(after.telemetryByDeviceId).not.toBe(before.telemetryByDeviceId);
    expect(after.statusByDeviceId).toBe(before.statusByDeviceId);
    expect(after.dirtyStatusDeviceIds).toBe(before.dirtyStatusDeviceIds);
    expect(after.statusVersion).toBe(before.statusVersion);
    expect(after.priorityMembershipVersion).toBe(before.priorityMembershipVersion);
  });
});
