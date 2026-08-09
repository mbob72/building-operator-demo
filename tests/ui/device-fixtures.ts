import type {
  Alarm,
  CommandRecord,
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

export const makeAlarm = (
  id: string,
  deviceId: string,
  overrides: Partial<Alarm> = {},
): Alarm => ({
  id,
  deviceId,
  severity: 'warning',
  code: 'TEST_ALARM',
  message: `Alarm ${id}`,
  createdAt: '2026-08-09T12:00:00.000Z',
  updatedAt: '2026-08-09T12:00:00.000Z',
  state: 'active',
  acknowledgedAt: null,
  acknowledgedBy: null,
  resolvedAt: null,
  ...overrides,
});

export const makeCommand = (
  id: string,
  deviceId: string,
  overrides: Partial<CommandRecord> = {},
): CommandRecord => ({
  id,
  clientRequestId: `request-${id}`,
  deviceId,
  intent: { kind: 'setOnOff', value: false },
  state: 'pending',
  requestedAt: '2026-08-09T12:00:00.000Z',
  requestedBy: 'demo-operator',
  confirmation: null,
  acceptedAt: null,
  executedAt: null,
  failedAt: null,
  timedOutAt: null,
  failure: null,
  resultTelemetryRevision: null,
  ...overrides,
});
