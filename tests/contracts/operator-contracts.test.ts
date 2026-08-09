import { describe, expect, it } from 'vitest';
import {
  AlarmSchema,
  CommandDraftSchema,
  CommandRecordSchema,
  DeviceCatalogSchema,
  DeviceMetadataSchema,
  DeviceTelemetrySchema,
} from '../../src/shared/domain-contracts';
import {
  CreateCommandRequestSchema,
  StateSnapshotSchema,
} from '../../src/shared/api-contracts';
import {
  EventBatchMessageSchema,
  ResyncRequiredMessageSchema,
} from '../../src/shared/realtime-contracts';

const timestamp = '2026-08-07T12:00:00.000Z';

const device = {
  id: 'device-light-1',
  name: 'Level 1 light 1',
  type: 'light',
  protocol: 'dali',
  buildingId: 'west-riverside',
  floorId: 'west-riverside-level-1',
  roomId: null,
  position: { x: 12.5, y: 18.25 },
  dataOrigin: 'synthetic',
  provenance: {
    kind: 'synthetic',
    generator: 'operator-contract-test',
    seed: 20260807,
  },
  binding: {
    mode: 'simulated',
    protocol: 'dali',
    reference: 'sim:dali:level-1:1',
    dataOrigin: 'synthetic',
  },
  capabilities: {
    telemetry: [{
      key: 'on',
      label: 'Power state',
      valueType: 'boolean',
      unit: null,
      precision: null,
    }],
    commands: [{ kind: 'setOnOff', requiresConfirmation: false }],
  },
} as const;

const telemetry = {
  deviceId: device.id,
  revision: 41,
  observedAt: timestamp,
  receivedAt: timestamp,
  connection: 'online',
  status: 'normal',
  values: { on: true },
} as const;

const alarm = {
  id: 'alarm-1',
  deviceId: device.id,
  severity: 'warning',
  code: 'LIGHT_POWER_MISMATCH',
  message: 'Reported power does not match the expected state',
  createdAt: timestamp,
  updatedAt: timestamp,
  state: 'active',
  acknowledgedAt: null,
  acknowledgedBy: null,
  resolvedAt: null,
} as const;

const command = {
  id: 'command-1',
  clientRequestId: 'client-request-1',
  deviceId: device.id,
  intent: { kind: 'setOnOff', value: false },
  state: 'pending',
  requestedAt: timestamp,
  requestedBy: 'demo-operator',
  confirmation: null,
  acceptedAt: null,
  executedAt: null,
  failedAt: null,
  timedOutAt: null,
  failure: null,
  resultTelemetryRevision: null,
} as const;

describe('operator domain contracts', () => {
  it('validates stable catalog metadata and its declared count', () => {
    const catalog = {
      catalogVersion: 'catalog-v1',
      generatedAt: timestamp,
      building: {
        id: 'west-riverside',
        name: 'West Riverside Hospital',
        timezone: 'America/Los_Angeles',
      },
      floors: [{
        id: 'west-riverside-level-1',
        buildingId: 'west-riverside',
        name: 'Level 1',
        elevation: 165.8112,
        bounds: [0, 0, 103.7877, 97.1645],
        order: 1,
      }],
      devices: [device],
      totalDevices: 1,
    };

    expect(DeviceCatalogSchema.parse(catalog).devices).toHaveLength(1);
    expect(DeviceCatalogSchema.safeParse({ ...catalog, totalDevices: 2 }).success).toBe(false);
    expect(DeviceCatalogSchema.safeParse({
      ...catalog,
      devices: [{ ...device, floorId: 'missing-floor' }],
    }).success).toBe(false);
  });

  it('keeps hot status out of stable device metadata', () => {
    expect(DeviceMetadataSchema.parse(device).id).toBe(device.id);
    expect(DeviceMetadataSchema.safeParse({ ...device, status: 'critical' }).success).toBe(false);
    expect(DeviceMetadataSchema.safeParse({
      ...device,
      binding: { ...device.binding, protocol: 'knx' },
    }).success).toBe(false);
    expect(DeviceTelemetrySchema.parse(telemetry).status).toBe('normal');
    expect(DeviceTelemetrySchema.safeParse({
      ...telemetry,
      connection: 'offline',
    }).success).toBe(false);
  });

  it('enforces alarm lifecycle audit fields', () => {
    expect(AlarmSchema.parse(alarm).state).toBe('active');
    expect(AlarmSchema.safeParse({ ...alarm, state: 'acknowledged' }).success).toBe(false);
    expect(AlarmSchema.safeParse({ ...alarm, state: 'resolved' }).success).toBe(false);
    expect(AlarmSchema.safeParse({
      ...alarm,
      state: 'acknowledged',
      acknowledgedAt: timestamp,
      acknowledgedBy: 'demo-operator',
    }).success).toBe(true);
  });

  it('separates a UI command draft from a backend command record', () => {
    const draft = {
      state: 'draft',
      deviceId: device.id,
      intent: { kind: 'setOnOff', value: false },
      requiresConfirmation: false,
    };
    const request = {
      clientRequestId: command.clientRequestId,
      deviceId: command.deviceId,
      intent: command.intent,
      requestedAt: timestamp,
      requestedBy: 'demo-operator',
      confirmation: null,
    };

    expect(CommandDraftSchema.parse(draft).state).toBe('draft');
    expect(CreateCommandRequestSchema.parse(request).clientRequestId).toBe('client-request-1');
    expect(CommandRecordSchema.parse(command).state).toBe('pending');
    expect(CommandRecordSchema.safeParse({ ...command, state: 'draft' }).success).toBe(false);
    expect(CommandRecordSchema.safeParse({ ...command, state: 'executed' }).success).toBe(false);
    expect(CommandRecordSchema.safeParse({
      ...command,
      failedAt: timestamp,
    }).success).toBe(false);
  });

  it('validates an authoritative state snapshot', () => {
    const snapshot = StateSnapshotSchema.parse({
      snapshotId: 'snapshot-1',
      buildingId: 'west-riverside',
      streamId: 'stream-1',
      sequence: 100,
      generatedAt: timestamp,
      telemetry: [telemetry],
      alarms: [alarm],
      commands: [command],
    });

    expect(snapshot.sequence).toBe(100);
    expect(snapshot.telemetry[0]?.deviceId).toBe(device.id);
  });
});

describe('realtime transport contracts', () => {
  it('accepts contiguous event batches and rejects sequence gaps', () => {
    const firstEvent = {
      sequence: 101,
      event: {
        type: 'telemetry.patch',
        payload: {
          deviceId: device.id,
          revision: 42,
          observedAt: timestamp,
          receivedAt: timestamp,
          values: { on: false },
        },
      },
    } as const;
    const secondEvent = {
      sequence: 102,
      event: { type: 'alarm.upsert', payload: alarm },
    } as const;
    const batch = {
      type: 'event.batch',
      streamId: 'stream-1',
      emittedAt: timestamp,
      fromSequence: 101,
      toSequence: 102,
      events: [firstEvent, secondEvent],
    } as const;

    expect(EventBatchMessageSchema.parse(batch).events).toHaveLength(2);
    expect(EventBatchMessageSchema.safeParse({
      ...batch,
      toSequence: 103,
      events: [firstEvent, { ...secondEvent, sequence: 103 }],
    }).success).toBe(false);
  });

  it('defines an explicit snapshot fallback when replay is impossible', () => {
    const message = ResyncRequiredMessageSchema.parse({
      type: 'resync.required',
      streamId: 'stream-2',
      latestSequence: 2_000,
      reason: 'streamChanged',
      snapshotPath: '/api/v1/state/snapshot?buildingId=west-riverside',
    });

    expect(message.reason).toBe('streamChanged');
  });
});
