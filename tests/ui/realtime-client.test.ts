// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { StateSnapshot } from '../../src/shared/api-contracts';
import { RealtimeClient } from '../../src/client/src/realtime-client';
import { RealtimeHotStore } from '../../src/client/src/realtime-hot-store';
import { makeTelemetry } from './device-fixtures';

const timestamp = '2026-08-09T12:00:00.000Z';
const snapshot = (sequence = 10): StateSnapshot => ({
  snapshotId: `snapshot-${sequence}`,
  buildingId: 'west-riverside',
  streamId: 'stream-1',
  sequence,
  generatedAt: timestamp,
  telemetry: [makeTelemetry('device-1', 'normal')],
  alarms: [],
  commands: [],
});

class FakeSocket {
  readyState = 0;
  sent: string[] = [];
  onopen: ((event: Event) => unknown) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: ((event: CloseEvent) => unknown) | null = null;
  onerror: ((event: Event) => unknown) | null = null;

  send(data: string) {
    this.sent.push(data);
  }

  open() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  receive(message: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(message) }));
  }

  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close'));
  }
}

describe('RealtimeClient', () => {
  it('resumes from the snapshot cursor and applies a live batch', () => {
    const store = new RealtimeHotStore();
    store.replaceSnapshot(snapshot());
    const socket = new FakeSocket();
    const client = new RealtimeClient({
      store,
      loadSnapshot: vi.fn(),
      createSocket: () => socket,
      realtimeUrl: 'ws://test/realtime',
    });

    client.start();
    socket.open();
    expect(JSON.parse(socket.sent[0]!)).toEqual({
      type: 'resume',
      protocolVersion: '1',
      buildingId: 'west-riverside',
      streamId: 'stream-1',
      afterSequence: 10,
    });

    socket.receive({
      type: 'event.batch',
      streamId: 'stream-1',
      emittedAt: timestamp,
      fromSequence: 11,
      toSequence: 11,
      events: [{
        sequence: 11,
        event: {
          type: 'telemetry.patch',
          payload: {
            deviceId: 'device-1',
            revision: 2,
            observedAt: timestamp,
            receivedAt: timestamp,
            values: { temperature: 23.1 },
          },
        },
      }],
    });

    expect(store.getSnapshot().sequence).toBe(11);
    expect(store.getSnapshot().connectionStatus).toBe('live');
    expect(store.getSnapshot().telemetryByDeviceId.get('device-1')?.values.temperature).toBe(23.1);
    client.stop();
  });

  it('replaces state from a snapshot when the server requires resync', async () => {
    const store = new RealtimeHotStore();
    store.replaceSnapshot(snapshot());
    const socket = new FakeSocket();
    const loadSnapshot = vi.fn().mockResolvedValue(snapshot(50));
    const client = new RealtimeClient({
      store,
      loadSnapshot,
      createSocket: () => socket,
      realtimeUrl: 'ws://test/realtime',
    });
    client.start();
    socket.open();

    socket.receive({
      type: 'resync.required',
      streamId: 'stream-1',
      latestSequence: 50,
      reason: 'cursorExpired',
      snapshotPath: '/api/v1/state/snapshot?buildingId=west-riverside',
    });
    await vi.waitFor(() => expect(store.getSnapshot().sequence).toBe(50));

    expect(loadSnapshot).toHaveBeenCalledWith(
      '/api/v1/state/snapshot?buildingId=west-riverside',
    );
    expect(JSON.parse(socket.sent.at(-1)!)).toMatchObject({
      type: 'resume',
      streamId: 'stream-1',
      afterSequence: 50,
    });
    client.stop();
  });

  it('requests an authoritative snapshot when a live batch has a sequence gap', async () => {
    const store = new RealtimeHotStore();
    store.replaceSnapshot(snapshot());
    const socket = new FakeSocket();
    const loadSnapshot = vi.fn().mockResolvedValue(snapshot(50));
    const client = new RealtimeClient({
      store,
      loadSnapshot,
      createSocket: () => socket,
      realtimeUrl: 'ws://test/realtime',
    });
    client.start();
    socket.open();

    socket.receive({
      type: 'event.batch',
      streamId: 'stream-1',
      emittedAt: timestamp,
      fromSequence: 12,
      toSequence: 12,
      events: [{
        sequence: 12,
        event: {
          type: 'telemetry.patch',
          payload: {
            deviceId: 'device-1',
            revision: 2,
            observedAt: timestamp,
            receivedAt: timestamp,
            values: { temperature: 25 },
          },
        },
      }],
    });
    await vi.waitFor(() => expect(store.getSnapshot().sequence).toBe(50));

    expect(loadSnapshot).toHaveBeenCalledWith(undefined);
    expect(JSON.parse(socket.sent.at(-1)!)).toMatchObject({
      type: 'resume',
      afterSequence: 50,
    });
    client.stop();
  });

  it('schedules an exponential reconnect after socket close', () => {
    const store = new RealtimeHotStore();
    store.replaceSnapshot(snapshot());
    const sockets: FakeSocket[] = [];
    const scheduled: Array<{ callback: () => void; delay: number }> = [];
    const client = new RealtimeClient({
      store,
      loadSnapshot: vi.fn(),
      createSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      realtimeUrl: 'ws://test/realtime',
      schedule: (callback, delay) => {
        scheduled.push({ callback, delay });
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      cancelSchedule: vi.fn(),
    });

    client.start();
    sockets[0]!.open();
    sockets[0]!.close();
    expect(store.getSnapshot().connectionStatus).toBe('reconnecting');
    expect(scheduled[0]?.delay).toBe(250);

    scheduled[0]!.callback();
    expect(sockets).toHaveLength(2);
    sockets[1]!.open();
    expect(JSON.parse(sockets[1]!.sent[0]!)).toMatchObject({
      type: 'resume',
      streamId: 'stream-1',
      afterSequence: 10,
    });
    sockets[1]!.receive({
      type: 'hello',
      protocolVersion: '1',
      connectionId: 'connection-recovered',
      streamId: 'stream-1',
      latestSequence: 10,
      retentionStartSequence: 1,
      heartbeatIntervalMs: 5_000,
    });
    expect(store.getSnapshot().connectionStatus).toBe('live');
    sockets[1]!.close();
    expect(scheduled[1]?.delay).toBe(250);
    client.stop();
  });

  it('resyncs atomically when a batch references an unknown device', async () => {
    const store = new RealtimeHotStore();
    store.replaceSnapshot(snapshot());
    const socket = new FakeSocket();
    const loadSnapshot = vi.fn().mockResolvedValue(snapshot(50));
    const client = new RealtimeClient({
      store,
      loadSnapshot,
      createSocket: () => socket,
      realtimeUrl: 'ws://test/realtime',
    });
    client.start();
    socket.open();

    socket.receive({
      type: 'event.batch',
      streamId: 'stream-1',
      emittedAt: timestamp,
      fromSequence: 11,
      toSequence: 11,
      events: [{
        sequence: 11,
        event: {
          type: 'telemetry.patch',
          payload: {
            deviceId: 'device-unknown',
            revision: 1,
            observedAt: timestamp,
            receivedAt: timestamp,
            values: { temperature: 25 },
          },
        },
      }],
    });

    await vi.waitFor(() => expect(store.getSnapshot().sequence).toBe(50));
    expect(loadSnapshot).toHaveBeenCalledOnce();
    expect(store.getSnapshot().telemetryByDeviceId.has('device-unknown')).toBe(false);
    client.stop();
  });

  it('coalesces concurrent resync signals into one authoritative snapshot request', async () => {
    const store = new RealtimeHotStore();
    store.replaceSnapshot(snapshot());
    const socket = new FakeSocket();
    let resolveSnapshot!: (value: StateSnapshot) => void;
    const loadSnapshot = vi.fn().mockReturnValue(new Promise<StateSnapshot>((resolve) => {
      resolveSnapshot = resolve;
    }));
    const client = new RealtimeClient({
      store,
      loadSnapshot,
      createSocket: () => socket,
      realtimeUrl: 'ws://test/realtime',
    });
    client.start();
    socket.open();
    const resyncMessage = {
      type: 'resync.required',
      streamId: 'stream-1',
      latestSequence: 50,
      reason: 'cursorExpired',
      snapshotPath: '/api/v1/state/snapshot?buildingId=west-riverside',
    };

    socket.receive(resyncMessage);
    socket.receive(resyncMessage);
    expect(loadSnapshot).toHaveBeenCalledOnce();
    resolveSnapshot(snapshot(50));
    await vi.waitFor(() => expect(store.getSnapshot().sequence).toBe(50));
    client.stop();
  });
});
