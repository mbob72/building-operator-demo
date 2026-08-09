import { describe, expect, it } from 'vitest';
import {
  countOpenAlarms,
  filterAndSortAlarms,
  selectVisibleAlarmByDevice,
} from '../../src/client/src/alarm-model';
import { makeAlarm } from './device-fixtures';

describe('alarm selectors', () => {
  const alarms = [
    makeAlarm('resolved', 'device-1', {
      state: 'resolved',
      severity: 'critical',
      resolvedAt: '2026-08-09T13:00:00.000Z',
      updatedAt: '2026-08-09T13:00:00.000Z',
    }),
    makeAlarm('acknowledged', 'device-1', {
      state: 'acknowledged',
      acknowledgedAt: '2026-08-09T12:30:00.000Z',
      acknowledgedBy: 'operator-1',
      updatedAt: '2026-08-09T12:30:00.000Z',
    }),
    makeAlarm('active-warning', 'device-1'),
    makeAlarm('active-critical', 'device-1', { severity: 'critical' }),
    makeAlarm('other-active', 'device-2'),
  ];

  it('filters by lifecycle state and severity, then sorts operationally', () => {
    expect(filterAndSortAlarms(alarms, { severity: 'critical', state: 'all' })
      .map((alarm) => alarm.id)).toEqual(['active-critical', 'resolved']);
    expect(filterAndSortAlarms(alarms, { severity: 'all', state: 'acknowledged' })
      .map((alarm) => alarm.id)).toEqual(['acknowledged']);
    expect(filterAndSortAlarms(alarms, { severity: 'all', state: 'all' })[0]?.id)
      .toBe('active-critical');
  });

  it('counts unresolved lifecycle states without treating resolved as open', () => {
    expect(countOpenAlarms(alarms)).toEqual({ active: 3, acknowledged: 1, total: 4 });
  });

  it('selects one strongest unresolved plan marker per device', () => {
    const selected = selectVisibleAlarmByDevice(alarms);

    expect(selected.get('device-1')?.id).toBe('active-critical');
    expect(selected.get('device-2')?.id).toBe('other-active');
    expect([...selected.values()].some((alarm) => alarm.state === 'resolved')).toBe(false);
  });
});
