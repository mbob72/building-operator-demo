import { describe, expect, it } from 'vitest';
import { filterDevices } from '../../src/client/src/operator-devices';
import { makeDevice, makeTelemetry } from './device-fixtures';

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
  const telemetry = new Map([
    ['AHU-L1-01', makeTelemetry('AHU-L1-01', 'warning')],
    ['LIGHT-L1-01', makeTelemetry('LIGHT-L1-01', 'normal')],
  ]);

  it('matches a trimmed case-insensitive name or ID search', () => {
    expect(filterDevices(devices, telemetry, { ...noFilters, search: '  AIR handler ' }))
      .toEqual([devices[0]]);
    expect(filterDevices(devices, telemetry, { ...noFilters, search: 'light-l1' }))
      .toEqual([devices[1]]);
  });

  it('combines type, protocol and telemetry status filters', () => {
    expect(filterDevices(devices, telemetry, {
      search: 'north',
      type: 'hvac-unit',
      protocol: 'bacnet',
      status: 'warning',
    })).toEqual([devices[0]]);
  });

  it('does not match a status filter when telemetry is missing', () => {
    expect(filterDevices(devices, telemetry, { ...noFilters, status: 'unknown' }))
      .toEqual([]);
    expect(filterDevices(devices, telemetry, noFilters)).toEqual(devices);
  });
});
