// @vitest-environment jsdom

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StateSnapshot } from '../../src/shared/api-contracts';
import { EventBatchMessageSchema } from '../../src/shared/realtime-contracts';
import { operatorRealtimeStore } from '../../src/client/src/realtime-hot-store';
import {
  useRealtimeBootstrap,
  useRealtimeSelector,
} from '../../src/client/src/use-realtime-state';
import { makeTelemetry } from './device-fixtures';

const timestamp = '2026-08-09T12:00:00.000Z';

const snapshot: StateSnapshot = {
  snapshotId: 'snapshot-selectors',
  buildingId: 'west-riverside',
  streamId: 'stream-selectors',
  sequence: 0,
  generatedAt: timestamp,
  telemetry: [makeTelemetry('device-1', 'normal'), makeTelemetry('device-2', 'normal')],
  alarms: [],
  commands: [],
};

const patchBatch = (deviceId: string, sequence: number) => EventBatchMessageSchema.parse({
  type: 'event.batch',
  streamId: snapshot.streamId,
  emittedAt: timestamp,
  fromSequence: sequence,
  toSequence: sequence,
  events: [{
    sequence,
    event: {
      type: 'telemetry.patch',
      payload: {
        deviceId,
        revision: 2,
        observedAt: timestamp,
        receivedAt: timestamp,
        values: { temperature: 20 + sequence },
      },
    },
  }],
});

describe('realtime selector subscriptions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not render a device consumer for another device update', () => {
    operatorRealtimeStore.reset();
    operatorRealtimeStore.replaceSnapshot(snapshot);
    let renderCount = 0;
    const SelectedDeviceValue = () => {
      const telemetry = useRealtimeSelector(
        (state) => state.telemetryByDeviceId.get('device-1'),
      );
      renderCount += 1;
      return <output>{telemetry?.values.temperature ?? 'unchanged'}</output>;
    };
    render(<SelectedDeviceValue />);

    act(() => {
      operatorRealtimeStore.applyBatch(patchBatch('device-2', 1));
    });
    expect(renderCount).toBe(1);
    expect(screen.getByText('unchanged')).toBeVisible();

    act(() => {
      operatorRealtimeStore.applyBatch(patchBatch('device-1', 2));
    });
    expect(renderCount).toBe(2);
    expect(screen.getByText('22')).toBeVisible();
  });

  it('loads the authoritative bootstrap directly into the hot store', async () => {
    operatorRealtimeStore.reset();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => snapshot,
    });
    class DormantSocket {
      readyState = 0;
      onopen = null;
      onmessage = null;
      onclose = null;
      onerror = null;
      send() {}
      close() {}
    }
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('WebSocket', DormantSocket);

    const BootstrapConsumer = () => {
      useRealtimeBootstrap();
      const ready = useRealtimeSelector((state) => state.ready);
      return <output>{ready ? 'ready' : 'loading'}</output>;
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <BootstrapConsumer />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('ready')).toBeVisible());
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/v1/state/snapshot?buildingId=west-riverside',
    );
    expect(operatorRealtimeStore.getSnapshot().streamId).toBe(snapshot.streamId);
  });
});
