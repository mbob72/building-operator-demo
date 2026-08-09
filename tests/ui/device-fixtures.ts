import type {
  DeviceMetadata,
  DeviceStatus,
  DeviceTelemetry,
} from '../../src/shared/domain-contracts';

export const makeDevice = (
  id: string,
  overrides: Partial<DeviceMetadata> = {},
): DeviceMetadata => {
  const protocol = overrides.protocol ?? 'dali';
  return {
    id,
    name: `Device ${id}`,
    type: 'light',
    protocol,
    buildingId: 'building-1',
    floorId: 'floor-1',
    roomId: null,
    position: { x: 0, y: 0 },
    dataOrigin: 'synthetic',
    provenance: { kind: 'synthetic', generator: 'unit-test', seed: 1 },
    binding: {
      mode: 'simulated',
      protocol,
      reference: `test:${id}`,
      dataOrigin: 'synthetic',
    },
    capabilities: { telemetry: [], commands: [] },
    ...overrides,
  };
};

export const makeTelemetry = (
  deviceId: string,
  status: DeviceStatus,
): DeviceTelemetry => ({
  deviceId,
  revision: 1,
  observedAt: '2026-08-09T12:00:00.000Z',
  receivedAt: '2026-08-09T12:00:00.000Z',
  connection: status === 'offline' ? 'offline' : 'online',
  status,
  values: {},
});
