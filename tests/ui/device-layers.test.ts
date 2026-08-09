import { describe, expect, it } from 'vitest';
import {
  partitionDeviceItems,
  statusForDevice,
} from '../../src/client/src/device-layers';
import { makeDevice, makeTelemetry } from './device-fixtures';

describe('device layer data preparation', () => {
  it('partitions warning and critical items into the priority group', () => {
    const devices = [
      makeDevice('normal'),
      makeDevice('warning'),
      makeDevice('critical'),
      makeDevice('offline'),
      makeDevice('missing'),
    ];
    const telemetry = new Map([
      ['normal', makeTelemetry('normal', 'normal')],
      ['warning', makeTelemetry('warning', 'warning')],
      ['critical', makeTelemetry('critical', 'critical')],
      ['offline', makeTelemetry('offline', 'offline')],
    ]);

    const result = partitionDeviceItems(devices, (device) => device, telemetry);

    expect(result.priority.map((device) => device.id)).toEqual(['warning', 'critical']);
    expect(result.normal.map((device) => device.id)).toEqual(['normal', 'offline', 'missing']);
  });

  it('preserves wrapped items and treats missing telemetry as unknown', () => {
    const item = { device: makeDevice('wrapped'), offset: [10, 20] as const };

    expect(partitionDeviceItems([item], ({ device }) => device, new Map()).normal[0]).toBe(item);
    expect(statusForDevice(new Map(), item.device.id)).toBe('unknown');
  });
});
