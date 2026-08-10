// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandControls } from '../../src/client/src/CommandControls';
import { useOperatorStore } from '../../src/client/src/operator-store';
import { operatorRealtimeStore } from '../../src/client/src/realtime-hot-store';
import { makeCommand, makeDevice, makeTelemetry } from './device-fixtures';

const commandDevice = makeDevice('device-command', {
  capabilities: {
    telemetry: [{ key: 'on', label: 'Power', valueType: 'boolean', unit: null, precision: null }],
    commands: [{ kind: 'setOnOff', requiresConfirmation: false }],
  },
});

beforeEach(() => {
  operatorRealtimeStore.reset();
  operatorRealtimeStore.replaceSnapshot({
    snapshotId: 'command-controls-snapshot',
    buildingId: 'west-riverside',
    streamId: 'stream-command-controls',
    sequence: 0,
    generatedAt: '2026-08-09T12:00:00.000Z',
    telemetry: [makeTelemetry(commandDevice.id, 'normal')],
    alarms: [],
    commands: [],
  });
  operatorRealtimeStore.setConnection('live');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  operatorRealtimeStore.reset();
  useOperatorStore.getState().setCommandDraft(undefined);
});

describe('CommandControls', () => {
  it('keeps draft desired state, backend lifecycle, and actual telemetry visibly separate', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
    const pending = makeCommand('command-1', commandDevice.id);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ command: pending }),
    }));
    render(<CommandControls
      device={commandDevice}
      telemetry={{ ...makeTelemetry(commandDevice.id, 'normal'), values: { on: true } }}
      commands={[]}
    />);

    fireEvent.change(screen.getByLabelText('Desired state'), { target: { value: 'off' } });
    expect(screen.getByText('Draft desired').nextSibling).toHaveTextContent('OFF');
    expect(screen.getByText('Actual telemetry').nextSibling).toHaveTextContent('ON');
    fireEvent.click(screen.getByRole('button', { name: 'Send command' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(operatorRealtimeStore.getSnapshot().commandsById.get('command-1')?.state).toBe('pending');
  });

  it('requires an explicit confirmation dialog for critical capabilities', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000002');
    const critical = makeDevice('device-critical', {
      capabilities: { telemetry: [], commands: [{ kind: 'setOnOff', requiresConfirmation: true }] },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ command: makeCommand('command-critical', critical.id, {
        confirmation: {
          confirmedAt: '2026-08-09T12:00:00.000Z',
          confirmedBy: 'demo-operator',
        },
      }) }),
    }));
    render(<CommandControls device={critical} telemetry={undefined} commands={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Review command' }));
    expect(screen.getByRole('dialog', { name: 'Potentially critical command' })).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and send' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const request = JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string);
    expect(request.confirmation).toMatchObject({ confirmedBy: 'demo-operator' });
  });

  it('builds a setpoint draft from capability bounds and step', async () => {
    const setpoint = makeDevice('device-setpoint', {
      capabilities: {
        telemetry: [],
        commands: [{
          kind: 'setSetpoint',
          unit: '°C',
          minimum: 16,
          maximum: 30,
          step: 0.5,
          requiresConfirmation: false,
        }],
      },
    });
    render(<CommandControls device={setpoint} telemetry={undefined} commands={[]} />);

    const input = screen.getByRole('spinbutton', { name: 'Desired setpoint' });
    expect(input).toHaveAttribute('min', '16');
    expect(input).toHaveAttribute('max', '30');
    expect(input).toHaveAttribute('step', '0.5');
    fireEvent.change(input, { target: { value: '21.5' } });
    expect(screen.getByText('Draft desired').nextSibling).toHaveTextContent('21.5 °C');
  });

  it('retries an uncertain submission explicitly with the same idempotency key', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000003')
      .mockReturnValue('00000000-0000-4000-8000-000000000004');
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('network interrupted'))
      .mockImplementationOnce(async (_url, init) => {
        const request = JSON.parse(init.body as string);
        return new Response(JSON.stringify({
          command: makeCommand('command-retried', commandDevice.id, {
            clientRequestId: request.clientRequestId,
            requestedAt: request.requestedAt,
            intent: request.intent,
          }),
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      });
    vi.stubGlobal('fetch', fetchMock);
    render(<CommandControls
      device={commandDevice}
      telemetry={{ ...makeTelemetry(commandDevice.id, 'normal'), values: { on: true } }}
      commands={[]}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Send command' }));
    await screen.findByRole('button', { name: 'Retry same command' });
    const firstRequest = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);

    fireEvent.click(screen.getByRole('button', { name: 'Retry same command' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const retriedRequest = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(retriedRequest).toEqual(firstRequest);
    expect(operatorRealtimeStore.getSnapshot().commandsById.get('command-retried')?.state)
      .toBe('pending');
  });
});
