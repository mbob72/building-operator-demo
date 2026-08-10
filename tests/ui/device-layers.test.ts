import { describe, expect, it } from 'vitest';
import {
  createDeviceIconLayer,
  deviceDataRanges,
  partitionDeviceItems,
  statusForDevice,
} from '../../src/client/src/device-layers';
import { makeDevice } from './device-fixtures';

describe('device layer data preparation', () => {
  it('partitions warning and critical items into the priority group', () => {
    const devices = [
      makeDevice('normal'),
      makeDevice('warning'),
      makeDevice('critical'),
      makeDevice('offline'),
      makeDevice('missing'),
    ];
    const statuses = new Map([
      ['normal', 'normal' as const],
      ['warning', 'warning' as const],
      ['critical', 'critical' as const],
      ['offline', 'offline' as const],
    ]);

    const result = partitionDeviceItems(devices, (device) => device, statuses);

    expect(result.priority.map((device) => device.id)).toEqual(['warning', 'critical']);
    expect(result.normal.map((device) => device.id)).toEqual(['normal', 'offline', 'missing']);
  });

  it('preserves wrapped items and treats missing telemetry as unknown', () => {
    const item = { device: makeDevice('wrapped'), offset: [10, 20] as const };

    expect(partitionDeviceItems([item], ({ device }) => device, new Map()).normal[0]).toBe(item);
    expect(statusForDevice(new Map(), item.device.id)).toBe('unknown');
  });

  it('turns dirty device IDs into minimal contiguous deck.gl data ranges', () => {
    const devices = ['a', 'b', 'c', 'd', 'e'].map((id) => makeDevice(id));

    expect(deviceDataRanges(devices, (device) => device, new Set(['b', 'c', 'e', 'missing'])))
      .toEqual([
        { startRow: 1, endRow: 3 },
        { startRow: 4, endRow: 5 },
      ]);
  });

  it('keeps the complete data array and filters visibility on the GPU', () => {
    const visible = makeDevice('visible');
    const hidden = makeDevice('hidden');
    const layer = createDeviceIconLayer({
      id: 'devices',
      data: [visible, hidden],
      getDevice: (device) => device,
      getPosition: (device) => [device.position.x, device.position.y],
      statusByDeviceId: new Map(),
      selectedDeviceId: undefined,
      zoom: 1,
      sizeMinPixels: 8,
      dataDiff: undefined,
      visibleDeviceIds: new Set([visible.id]),
    });

    expect(layer.props.data).toEqual([visible, hidden]);
    const getFilterValue = layer.props.getFilterValue;
    if (typeof getFilterValue !== 'function') throw new Error('filter accessor is unavailable');
    expect(getFilterValue(visible, {} as never)).toBe(1);
    expect(getFilterValue(hidden, {} as never)).toBe(0);
    expect(layer.props.filterRange).toEqual([1, 1]);
  });
});
