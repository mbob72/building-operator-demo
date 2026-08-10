// @vitest-environment jsdom

import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCommandStatusFallback } from '../../src/client/src/use-command-status-fallback';
import { operatorRealtimeStore } from '../../src/client/src/realtime-hot-store';
import { makeCommand, makeTelemetry } from './device-fixtures';

const timestamp = '2026-08-09T12:00:00.000Z';
const pending = makeCommand('command-poll', 'device-1');

const initialize = () => {
  operatorRealtimeStore.reset();
  operatorRealtimeStore.replaceSnapshot({
    snapshotId: 'snapshot-command-poll',
    buildingId: 'west-riverside',
    streamId: 'stream-command-poll',
    sequence: 10,
    generatedAt: timestamp,
    telemetry: [makeTelemetry('device-1', 'normal')],
    alarms: [],
    commands: [pending],
  });
};

const Harness = () => {
  useCommandStatusFallback();
  return null;
};

afterEach(() => {
  vi.unstubAllGlobals();
  operatorRealtimeStore.reset();
});

describe('command status fallback', () => {
  it('polls non-terminal commands while realtime is unavailable', async () => {
    initialize();
    operatorRealtimeStore.setConnection('reconnecting');
    const executed = makeCommand(pending.id, pending.deviceId, {
      state: 'executed',
      acceptedAt: '2026-08-09T12:00:01.000Z',
      executedAt: '2026-08-09T12:00:02.000Z',
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ command: executed }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<Harness />);

    await waitFor(() => expect(
      operatorRealtimeStore.getSnapshot().commandsById.get(pending.id)?.state,
    ).toBe('executed'));
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/commands/command-poll');
    expect(operatorRealtimeStore.getSnapshot().sequence).toBe(10);
  });

  it('does not poll when realtime is live', async () => {
    initialize();
    operatorRealtimeStore.setConnection('live');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<Harness />);
    await act(async () => Promise.resolve());

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
