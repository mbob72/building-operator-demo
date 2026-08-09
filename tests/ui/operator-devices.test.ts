import { describe, expect, it } from 'vitest';
import { filterDevices } from '../../src/client/src/operator-devices';
import { makeDevice } from './device-fixtures';

const noFilters = {
  search: '',
  type: 'all',
  protocol: 'all',
  status: 'all',
} as const;

describe('operator device filtering', () => {
  const devices = [
    makeDevice('AHU-L1-01', {
      name: 'North Air Handler',
      type: 'hvac-unit',
      protocol: 'bacnet',
    }),
    makeDevice('LIGHT-L1-01', {
      name: 'Lobby Light',
      type: 'light',
      protocol: 'dali',
    }),
    makeDevice('METER-L1-01', {
      name: 'Main Meter',
      type: 'meter',
      protocol: 'modbus',
    }),
  ];
  const statuses = new Map([
    ['AHU-L1-01', 'warning' as const],
    ['LIGHT-L1-01', 'normal' as const],
  ]);

  it('matches a trimmed case-insensitive name or ID search', () => {
    expect(filterDevices(devices, statuses, { ...noFilters, search: '  AIR handler ' }))
      .toEqual([devices[0]]);
    expect(filterDevices(devices, statuses, { ...noFilters, search: 'light-l1' }))
      .toEqual([devices[1]]);
  });

  it('combines type, protocol and telemetry status filters', () => {
    expect(filterDevices(devices, statuses, {
      search: 'north',
      type: 'hvac-unit',
      protocol: 'bacnet',
      status: 'warning',
    })).toEqual([devices[0]]);
  });

  it('does not match a status filter when telemetry is missing', () => {
    expect(filterDevices(devices, statuses, { ...noFilters, status: 'unknown' }))
      .toEqual([]);
    expect(filterDevices(devices, statuses, noFilters)).toEqual(devices);
  });
});
