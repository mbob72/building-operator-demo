// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

afterEach(() => {
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
});
