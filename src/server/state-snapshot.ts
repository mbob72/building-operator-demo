import {
  DeviceTelemetrySchema,
  type DeviceMetadata,
  type DeviceStatus,
  type DeviceTelemetry,
  type TelemetryScalar,
} from '../shared/domain-contracts.js';
import { StateSnapshotSchema, type StateSnapshot } from '../shared/api-contracts.js';
import { deviceCatalog } from './device-catalog.js';

const SNAPSHOT_TIME = '2026-08-08T00:00:00.000Z';

const stableHash = (value: string): number => {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
};

const statusFor = (hash: number): DeviceStatus => {
  const bucket = hash % 1_000;
  if (bucket < 10) return 'critical';
  if (bucket < 35) return 'warning';
  if (bucket < 60) return 'offline';
  return 'normal';
};

const valueFor = (
  key: string,
  valueType: 'boolean' | 'number' | 'string',
  hash: number,
): TelemetryScalar => {
  if (valueType === 'boolean') return hash % 2 === 0;
  if (valueType === 'string') return `value-${hash % 10}`;
  if (key.includes('temperature') || key === 'setpoint') return 18 + (hash % 100) / 10;
  if (key === 'co2') return 400 + hash % 900;
  if (key === 'level') return hash % 101;
  if (key === 'airflow') return 100 + hash % 900;
  if (key === 'power') return (hash % 2_500) / 100;
  if (key === 'energy') return (hash % 500_000) / 10;
  return hash % 1_000;
};

const telemetryFor = (device: DeviceMetadata): DeviceTelemetry => {
  const hash = stableHash(device.id);
  const status = statusFor(hash);
  const values = Object.fromEntries(device.capabilities.telemetry.map((channel, index) => [
    channel.key,
    valueFor(channel.key, channel.valueType, stableHash(`${device.id}:${index}`)),
  ]));
  return DeviceTelemetrySchema.parse({
    deviceId: device.id,
    revision: 1,
    observedAt: SNAPSHOT_TIME,
    receivedAt: SNAPSHOT_TIME,
    connection: status === 'offline' ? 'offline' : 'online',
    status,
    values,
  });
};

const deviceFloor = new Map(deviceCatalog.devices.map((device) => [device.id, device.floorId]));
const fullSnapshot = StateSnapshotSchema.parse({
  snapshotId: 'stage-4-static-snapshot-v1',
  buildingId: deviceCatalog.building.id,
  streamId: 'stage-4-static-stream-v1',
  sequence: 0,
  generatedAt: SNAPSHOT_TIME,
  telemetry: deviceCatalog.devices.map(telemetryFor),
  alarms: [],
  commands: [],
});

export const selectSnapshotFloors = (floorIds: string[]): StateSnapshot => {
  const selectedFloorIds = new Set(floorIds);
  const isBuildingScope = selectedFloorIds.size === deviceCatalog.floors.length
    && deviceCatalog.floors.every((floor) => selectedFloorIds.has(floor.id));
  const scopeId = isBuildingScope
    ? 'building'
    : floorIds.length === 1
      ? floorIds[0] ?? 'empty'
      : floorIds.map((floorId) => floorId.replace('west-riverside-', '')).join(',');
  const telemetry = fullSnapshot.telemetry.filter((item) => {
    const floorId = deviceFloor.get(item.deviceId);
    return floorId !== undefined && selectedFloorIds.has(floorId);
  });
  return {
    ...fullSnapshot,
    snapshotId: `${fullSnapshot.snapshotId}:${scopeId}`,
    telemetry,
  };
};
