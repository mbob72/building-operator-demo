import { describe, expect, it } from 'vitest';
import { createAlarmIndicatorLayer } from '../../src/client/src/alarm-layers';
import { makeAlarm, makeDevice } from './device-fixtures';

describe('alarm indicator layer', () => {
  it('renders warning, critical, and acknowledged alarms with distinct contours', () => {
    const devices = [makeDevice('warning'), makeDevice('critical'), makeDevice('acknowledged')];
    const alarms = new Map([
      ['warning', makeAlarm('alarm-warning', 'warning')],
      ['critical', makeAlarm('alarm-critical', 'critical', { severity: 'critical' })],
      ['acknowledged', makeAlarm('alarm-ack', 'acknowledged', {
        state: 'acknowledged',
        acknowledgedAt: '2026-08-09T12:00:00.000Z',
        acknowledgedBy: 'operator-1',
      })],
    ]);
    const layer = createAlarmIndicatorLayer({
      id: 'test-alarms',
      data: devices,
      getDevice: (device) => device,
      getPosition: (device) => [device.position.x, device.position.y],
      alarmByDeviceId: alarms,
    });
    const color = layer.props.getLineColor as unknown as (device: typeof devices[number]) => number[];
    const width = layer.props.getLineWidth as unknown as (device: typeof devices[number]) => number;

    expect(layer.id).toBe('test-alarms');
    expect(layer.props.filled).toBe(false);
    expect(color(devices[0]!)).toEqual([247, 188, 70, 250]);
    expect(color(devices[1]!)).toEqual([255, 86, 80, 255]);
    expect(color(devices[2]!)).toEqual([102, 164, 174, 225]);
    expect(width(devices[0]!)).toBe(2.5);
    expect(width(devices[2]!)).toBe(1.5);
  });
});
