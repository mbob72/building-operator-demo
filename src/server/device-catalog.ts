import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DeviceCatalogSchema,
  type DeviceCatalog,
} from '../shared/domain-contracts.js';

export const deviceFixture = process.env.BUILDING_DEVICE_FIXTURE === 'stress'
  ? 'stress'
  : 'representative';
const catalogFile = resolve(
  process.cwd(),
  deviceFixture === 'stress'
    ? 'data/generated/west-riverside.devices-50000.json.gz'
    : 'data/generated/west-riverside.devices-18000.json.gz',
);

export const deviceCatalog = DeviceCatalogSchema.parse(JSON.parse(
  gunzipSync(readFileSync(catalogFile)).toString('utf8'),
));

export const selectCatalogFloors = (floorIds: string[]): DeviceCatalog => {
  const selectedFloorIds = new Set(floorIds);
  const floors = deviceCatalog.floors.filter((floor) => selectedFloorIds.has(floor.id));
  const devices = deviceCatalog.devices.filter((device) => selectedFloorIds.has(device.floorId));
  return {
    ...deviceCatalog,
    floors,
    devices,
    totalDevices: devices.length,
  };
};
