import { z } from 'zod';

export const EntityIdSchema = z.string().min(1).max(128);
export const TimestampSchema = z.string().datetime({ offset: true });
export const SequenceSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const DataOriginSchema = z.enum(['ifc', 'derived', 'synthetic']);
export const DeviceProtocolSchema = z.enum([
  'dali',
  'knx',
  'modbus',
  'bacnet',
  'fire-alarm',
  'security',
  'access-control',
  'virtual',
  'other',
]);
export const DeviceTypeSchema = z.enum([
  'light',
  'presence-sensor',
  'temperature-sensor',
  'co2-sensor',
  'switch',
  'actuator',
  'smoke-detector',
  'heat-detector',
  'fire-alarm-sounder',
  'manual-pull-station',
  'sprinkler',
  'security-sensor',
  'hvac-terminal',
  'hvac-unit',
  'meter',
  'electrical-controller',
  'access-controller',
  'solar-panel',
  'other',
]);

export const PositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
}).strict();

export const FloorBoundsSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]).refine(([minX, minY, maxX, maxY]) => minX < maxX && minY < maxY, {
  message: 'floor bounds must have positive width and height',
});

export const BuildingMetadataSchema = z.object({
  id: EntityIdSchema,
  name: z.string().min(1).max(256),
  timezone: z.string().min(1).max(128),
}).strict();

export const FloorMetadataSchema = z.object({
  id: EntityIdSchema,
  buildingId: EntityIdSchema,
  name: z.string().min(1).max(256),
  elevation: z.number().finite(),
  bounds: FloorBoundsSchema,
  order: z.number().int(),
}).strict();

export const DeviceBindingSchema = z.object({
  mode: z.enum(['simulated', 'adapter']),
  protocol: DeviceProtocolSchema,
  reference: z.string().min(1).max(256),
  dataOrigin: DataOriginSchema,
}).strict();

export const DeviceProvenanceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ifc'),
    sourceFile: z.string().min(1).max(256),
    ifcGlobalId: z.string().min(1).max(128),
    ifcType: z.string().min(1).max(128),
    ifcId: z.number().int().positive(),
  }).strict(),
  z.object({
    kind: z.literal('derived'),
    rule: z.string().min(1).max(256),
    sourceRefs: z.array(z.string().min(1).max(256)).min(1),
  }).strict(),
  z.object({
    kind: z.literal('synthetic'),
    generator: z.string().min(1).max(256),
    seed: z.number().int().nonnegative(),
  }).strict(),
]);

export const TelemetryValueTypeSchema = z.enum(['boolean', 'number', 'string']);
export const TelemetryChannelDefinitionSchema = z.object({
  key: z.string().min(1).max(128),
  label: z.string().min(1).max(256),
  valueType: TelemetryValueTypeSchema,
  unit: z.string().min(1).max(32).nullable(),
  precision: z.number().int().min(0).max(8).nullable(),
}).strict();

export const OnOffCommandCapabilitySchema = z.object({
  kind: z.literal('setOnOff'),
  requiresConfirmation: z.boolean(),
}).strict();

export const SetpointCommandCapabilitySchema = z.object({
  kind: z.literal('setSetpoint'),
  unit: z.string().min(1).max(32),
  minimum: z.number().finite(),
  maximum: z.number().finite(),
  step: z.number().positive(),
  requiresConfirmation: z.boolean(),
}).strict().refine((capability) => capability.minimum < capability.maximum, {
  message: 'minimum must be less than maximum',
});

export const CommandCapabilitySchema = z.discriminatedUnion('kind', [
  OnOffCommandCapabilitySchema,
  SetpointCommandCapabilitySchema,
]);

export const DeviceCapabilitiesSchema = z.object({
  telemetry: z.array(TelemetryChannelDefinitionSchema),
  commands: z.array(CommandCapabilitySchema),
}).strict();

export const DeviceMetadataSchema = z.object({
  id: EntityIdSchema,
  name: z.string().min(1).max(256),
  type: DeviceTypeSchema,
  protocol: DeviceProtocolSchema,
  buildingId: EntityIdSchema,
  floorId: EntityIdSchema,
  roomId: EntityIdSchema.nullable(),
  position: PositionSchema,
  dataOrigin: DataOriginSchema,
  provenance: DeviceProvenanceSchema,
  binding: DeviceBindingSchema,
  capabilities: DeviceCapabilitiesSchema,
}).strict().superRefine((device, context) => {
  if (device.protocol !== device.binding.protocol) {
    context.addIssue({ code: 'custom', message: 'device protocol must match binding protocol' });
  }
  if (device.dataOrigin !== device.provenance.kind) {
    context.addIssue({ code: 'custom', message: 'dataOrigin must match provenance kind' });
  }
});

export const DeviceCatalogSchema = z.object({
  catalogVersion: EntityIdSchema,
  generatedAt: TimestampSchema,
  building: BuildingMetadataSchema,
  floors: z.array(FloorMetadataSchema),
  devices: z.array(DeviceMetadataSchema),
  totalDevices: z.number().int().nonnegative(),
}).strict().superRefine((catalog, context) => {
  if (catalog.totalDevices !== catalog.devices.length) {
    context.addIssue({ code: 'custom', message: 'totalDevices must match devices.length' });
  }

  const floorIds = new Set<string>();
  for (const floor of catalog.floors) {
    if (floorIds.has(floor.id)) {
      context.addIssue({ code: 'custom', message: `duplicate floor ID: ${floor.id}` });
    }
    floorIds.add(floor.id);
    if (floor.buildingId !== catalog.building.id) {
      context.addIssue({ code: 'custom', message: `floor ${floor.id} belongs to another building` });
    }
  }

  const deviceIds = new Set<string>();
  for (const device of catalog.devices) {
    if (deviceIds.has(device.id)) {
      context.addIssue({ code: 'custom', message: `duplicate device ID: ${device.id}` });
    }
    deviceIds.add(device.id);
    if (device.buildingId !== catalog.building.id || !floorIds.has(device.floorId)) {
      context.addIssue({ code: 'custom', message: `device ${device.id} has an invalid location reference` });
    }
  }
});

export const TelemetryScalarSchema = z.union([
  z.boolean(),
  z.number().finite(),
  z.string(),
  z.null(),
]);
export const DeviceConnectionSchema = z.enum(['online', 'offline', 'unknown']);
export const DeviceStatusSchema = z.enum(['normal', 'warning', 'critical', 'offline', 'unknown']);

export const DeviceTelemetrySchema = z.object({
  deviceId: EntityIdSchema,
  revision: SequenceSchema,
  observedAt: TimestampSchema,
  receivedAt: TimestampSchema,
  connection: DeviceConnectionSchema,
  status: DeviceStatusSchema,
  values: z.record(z.string().min(1).max(128), TelemetryScalarSchema),
}).strict().superRefine((telemetry, context) => {
  if (telemetry.connection === 'offline' && telemetry.status !== 'offline') {
    context.addIssue({ code: 'custom', message: 'offline connection requires offline status' });
  }
  if (telemetry.connection === 'online' && telemetry.status === 'offline') {
    context.addIssue({ code: 'custom', message: 'online connection cannot have offline status' });
  }
});

export const DeviceTelemetryPatchSchema = z.object({
  deviceId: EntityIdSchema,
  revision: SequenceSchema,
  observedAt: TimestampSchema,
  receivedAt: TimestampSchema,
  connection: DeviceConnectionSchema.optional(),
  status: DeviceStatusSchema.optional(),
  values: z.record(z.string().min(1).max(128), TelemetryScalarSchema).optional(),
}).strict().refine(
  (patch) => patch.connection !== undefined || patch.status !== undefined || patch.values !== undefined,
  { message: 'telemetry patch must change connection, status, or values' },
);

export const AlarmSeveritySchema = z.enum(['warning', 'critical']);
export const AlarmStateSchema = z.enum(['active', 'acknowledged', 'resolved']);

export const AlarmSchema = z.object({
  id: EntityIdSchema,
  deviceId: EntityIdSchema,
  severity: AlarmSeveritySchema,
  code: z.string().min(1).max(128),
  message: z.string().min(1).max(1_024),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  state: AlarmStateSchema,
  acknowledgedAt: TimestampSchema.nullable(),
  acknowledgedBy: EntityIdSchema.nullable(),
  resolvedAt: TimestampSchema.nullable(),
}).strict().superRefine((alarm, context) => {
  if (alarm.state === 'acknowledged'
    && (alarm.acknowledgedAt === null || alarm.acknowledgedBy === null)) {
    context.addIssue({
      code: 'custom',
      message: 'acknowledged alarms require acknowledgedAt and acknowledgedBy',
    });
  }
  if (alarm.state === 'resolved' && alarm.resolvedAt === null) {
    context.addIssue({ code: 'custom', message: 'resolved alarms require resolvedAt' });
  }
});

export const CommandIntentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('setOnOff'),
    value: z.boolean(),
  }).strict(),
  z.object({
    kind: z.literal('setSetpoint'),
    value: z.number().finite(),
  }).strict(),
]);

export const CommandStateSchema = z.enum([
  'draft',
  'pending',
  'accepted',
  'executed',
  'failed',
  'timedOut',
]);
export const BackendCommandStateSchema = z.enum([
  'pending',
  'accepted',
  'executed',
  'failed',
  'timedOut',
]);

export const CommandConfirmationSchema = z.object({
  confirmedAt: TimestampSchema,
  confirmedBy: EntityIdSchema,
}).strict();

export const CommandDraftSchema = z.object({
  state: z.literal('draft'),
  deviceId: EntityIdSchema,
  intent: CommandIntentSchema,
  requiresConfirmation: z.boolean(),
}).strict();

export const CommandRecordSchema = z.object({
  id: EntityIdSchema,
  clientRequestId: EntityIdSchema,
  deviceId: EntityIdSchema,
  intent: CommandIntentSchema,
  state: BackendCommandStateSchema,
  requestedAt: TimestampSchema,
  requestedBy: EntityIdSchema,
  confirmation: CommandConfirmationSchema.nullable(),
  acceptedAt: TimestampSchema.nullable(),
  executedAt: TimestampSchema.nullable(),
  failedAt: TimestampSchema.nullable(),
  timedOutAt: TimestampSchema.nullable(),
  failure: z.object({
    code: z.string().min(1).max(128),
    message: z.string().min(1).max(1_024),
  }).strict().nullable(),
  resultTelemetryRevision: SequenceSchema.nullable(),
}).strict().superRefine((command, context) => {
  const issue = (message: string) => context.addIssue({ code: 'custom', message });

  if (command.state === 'accepted' && command.acceptedAt === null) {
    issue('accepted commands require acceptedAt');
  }
  if (command.state === 'executed'
    && (command.acceptedAt === null || command.executedAt === null)) {
    issue('executed commands require acceptedAt and executedAt');
  }
  if (command.state === 'failed' && (command.failedAt === null || command.failure === null)) {
    issue('failed commands require failedAt and failure');
  }
  if (command.state === 'timedOut' && command.timedOutAt === null) {
    issue('timedOut commands require timedOutAt');
  }

  const terminalTimestamps = [command.executedAt, command.failedAt, command.timedOutAt]
    .filter((value) => value !== null);
  if (terminalTimestamps.length > 1) issue('command can have only one terminal timestamp');
  if (command.state !== 'failed' && command.failure !== null) {
    issue('failure details are only valid for failed commands');
  }
});

export type BuildingMetadata = z.infer<typeof BuildingMetadataSchema>;
export type FloorMetadata = z.infer<typeof FloorMetadataSchema>;
export type DeviceProtocol = z.infer<typeof DeviceProtocolSchema>;
export type DeviceType = z.infer<typeof DeviceTypeSchema>;
export type DeviceMetadata = z.infer<typeof DeviceMetadataSchema>;
export type DeviceCatalog = z.infer<typeof DeviceCatalogSchema>;
export type TelemetryScalar = z.infer<typeof TelemetryScalarSchema>;
export type DeviceStatus = z.infer<typeof DeviceStatusSchema>;
export type DeviceTelemetry = z.infer<typeof DeviceTelemetrySchema>;
export type DeviceTelemetryPatch = z.infer<typeof DeviceTelemetryPatchSchema>;
export type Alarm = z.infer<typeof AlarmSchema>;
export type AlarmSeverity = z.infer<typeof AlarmSeveritySchema>;
export type AlarmState = z.infer<typeof AlarmStateSchema>;
export type CommandIntent = z.infer<typeof CommandIntentSchema>;
export type CommandDraft = z.infer<typeof CommandDraftSchema>;
export type CommandRecord = z.infer<typeof CommandRecordSchema>;
