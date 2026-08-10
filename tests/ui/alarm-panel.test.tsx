// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlarmPanel, ALARM_PANEL_VISIBLE_LIMIT } from '../../src/client/src/AlarmPanel';
import { useOperatorStore } from '../../src/client/src/operator-store';
import { operatorRealtimeStore } from '../../src/client/src/realtime-hot-store';
import {
  DeviceProtocolSchema,
  DeviceStatusSchema,
  DeviceTypeSchema,
} from '../../src/shared/domain-contracts';
import { makeAlarm, makeDevice, makeTelemetry } from './device-fixtures';

const timestamp = '2026-08-09T12:00:00.000Z';
const warning = makeAlarm('alarm-warning', 'device-1');
const critical = makeAlarm('alarm-critical', 'device-2', { severity: 'critical' });
const devices = [
  makeDevice('device-1'),
  makeDevice('device-2', { floorId: 'floor-2' }),
];

beforeEach(() => {
  useOperatorStore.setState({
    viewMode: 'overview',
    selectedFloorId: 'floor-1',
    selectedDeviceId: undefined,
    search: 'stale filter',
    typeFilters: ['light'],
    protocolFilters: ['dali'],
    statusFilters: ['critical'],
    alarmPanelOpen: true,
    alarmSeverityFilter: 'all',
    alarmStateFilter: 'all',
  });
  operatorRealtimeStore.reset();
  operatorRealtimeStore.replaceSnapshot({
    snapshotId: 'snapshot-1',
    buildingId: 'west-riverside',
    streamId: 'stream-1',
    sequence: 10,
    generatedAt: timestamp,
    telemetry: [makeTelemetry('device-1', 'warning'), makeTelemetry('device-2', 'critical')],
    alarms: [warning, critical],
    commands: [],
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  operatorRealtimeStore.reset();
});

describe('AlarmPanel', () => {
  it('filters, acknowledges, and navigates to the alarm device', async () => {
    const acknowledged = makeAlarm('alarm-critical', 'device-2', {
      severity: 'critical',
      state: 'acknowledged',
      acknowledgedAt: timestamp,
      acknowledgedBy: 'demo-operator',
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      alarm: acknowledged,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AlarmPanel devices={devices} />);

    expect(screen.getAllByTestId('alarm-row')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Severity'), { target: { value: 'critical' } });
    expect(screen.getAllByTestId('alarm-row')).toHaveLength(1);
    const deviceMarkers = screen.getByLabelText('Device type, protocol, and status');
    expect(deviceMarkers.querySelector('.device-type-icon')).toBeInTheDocument();
    expect(deviceMarkers.querySelector('.device-protocol-badge--dali')).toHaveTextContent('DALI');
    expect(deviceMarkers.querySelector('.device-status-square--critical')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(
      operatorRealtimeStore.getSnapshot().alarmsById.get('alarm-critical')?.state,
    ).toBe('acknowledged'));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/alarms/alarm-critical/acknowledge',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(screen.getByText(/Acknowledged by demo-operator/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Locate' }));
    expect(useOperatorStore.getState()).toMatchObject({
      viewMode: 'floor',
      selectedFloorId: 'floor-2',
      selectedDeviceId: 'device-2',
      alarmPanelOpen: true,
      search: '',
      typeFilters: [...DeviceTypeSchema.options],
      protocolFilters: [...DeviceProtocolSchema.options],
      statusFilters: [...DeviceStatusSchema.options],
    });
  });

  it('bounds building-list DOM work during an alarm burst', () => {
    const alarms = Array.from({ length: 80 }, (_, index) => (
      makeAlarm(`alarm-burst-${index}`, index % 2 === 0 ? 'device-1' : 'device-2')
    ));
    operatorRealtimeStore.replaceSnapshot({
      snapshotId: 'snapshot-alarm-burst',
      buildingId: 'west-riverside',
      streamId: 'stream-1',
      sequence: 20,
      generatedAt: timestamp,
      telemetry: [makeTelemetry('device-1', 'warning'), makeTelemetry('device-2', 'critical')],
      alarms,
      commands: [],
    });

    render(<AlarmPanel devices={devices} />);

    expect(screen.getAllByTestId('alarm-row')).toHaveLength(ALARM_PANEL_VISIBLE_LIMIT);
    expect(screen.getByText(`Showing ${ALARM_PANEL_VISIBLE_LIMIT} of 80 matching alarms.`))
      .toBeVisible();
  });
});
