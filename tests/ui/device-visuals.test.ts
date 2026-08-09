import { describe, expect, it } from 'vitest';
import {
  DEVICE_ICON_ATLAS_CELL_SIZE,
  deviceIconOrder,
  iconByDeviceType,
  iconForDevice,
  iconMapping,
} from '../../src/client/src/device-visuals';
import { DeviceTypeSchema } from '../../src/shared/domain-contracts';
import { makeDevice } from './device-fixtures';

describe('device type icon mapping', () => {
  it('assigns every domain device type its own atlas slot', () => {
    expect(deviceIconOrder).toEqual(DeviceTypeSchema.options);
    expect(new Set(deviceIconOrder).size).toBe(DeviceTypeSchema.options.length);
    expect(new Set(Object.values(iconByDeviceType)).size).toBe(DeviceTypeSchema.options.length);

    DeviceTypeSchema.options.forEach((type, index) => {
      expect(iconByDeviceType[type]).toBe(type);
      expect(iconForDevice(makeDevice(type, { type }))).toBe(type);
      expect(iconMapping[type]).toMatchObject({
        x: index * DEVICE_ICON_ATLAS_CELL_SIZE,
        y: 0,
        width: DEVICE_ICON_ATLAS_CELL_SIZE,
        height: DEVICE_ICON_ATLAS_CELL_SIZE,
      });
    });
  });
});
