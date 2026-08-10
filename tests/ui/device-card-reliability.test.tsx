// @vitest-environment jsdom

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DeviceCard, DEVICE_CARD_ALARM_LIMIT } from '../../src/client/src/DeviceCard';
import { operatorRealtimeStore } from '../../src/client/src/realtime-hot-store';
import { EventBatchMessageSchema } from '../../src/shared/realtime-contracts';
import { makeAlarm, makeDevice, makeTelemetry } from './device-fixtures';

const timestamp = '2026-08-09T12:00:00.000Z';
const device = makeDevice('device-card', { roomId: null });
const floor = {
  id: 'floor-1',
  name: 'West Riverside Hospital · Level 1',
  elevation: 0,
  bounds: [0, 0, 100, 100] as [number, number, number, number],
  order: 1,
};

afterEach(() => operatorRealtimeStore.reset());

describe('DeviceCard reliability', () => {
  it('shows a nullable room safely and bounds rendering during an alarm burst', () => {
    operatorRealtimeStore.reset();
    operatorRealtimeStore.replaceSnapshot({
      snapshotId: 'snapshot-device-card',
      buildingId: 'west-riverside',
      streamId: 'stream-device-card',
      sequence: 0,
      generatedAt: timestamp,
      telemetry: [makeTelemetry(device.id, 'normal')],
      alarms: [],
      commands: [],
    });
    render(<DeviceCard device={device} floors={[floor]} onClose={() => undefined} />);
    expect(screen.getByText('Room').nextSibling).toHaveTextContent('Unassigned');

    const events = Array.from({ length: 200 }, (_, index) => ({
      sequence: index + 1,
      event: {
        type: 'alarm.upsert' as const,
        payload: makeAlarm(`alarm-card-${index}`, device.id),
      },
    }));
    act(() => {
      operatorRealtimeStore.applyBatch(EventBatchMessageSchema.parse({
        type: 'event.batch',
        streamId: 'stream-device-card',
        emittedAt: timestamp,
        fromSequence: 1,
        toSequence: 200,
        events,
      }));
    });

    expect(screen.getByRole('complementary', { name: 'Selected device' })).toBeVisible();
    expect(screen.getAllByTestId('device-card-alarm')).toHaveLength(DEVICE_CARD_ALARM_LIMIT);
    expect(screen.getByText(`Showing ${DEVICE_CARD_ALARM_LIMIT} of 200 device alarms.`))
      .toBeVisible();
  });
});
