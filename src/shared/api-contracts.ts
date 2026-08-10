import { z } from 'zod';
import {
  AlarmSchema,
  CommandConfirmationSchema,
  CommandIntentSchema,
  CommandRecordSchema,
  DeviceCatalogSchema,
  DeviceTelemetrySchema,
  EntityIdSchema,
  SequenceSchema,
  TimestampSchema,
} from './domain-contracts.js';

export const ApiErrorSchema = z.object({
  code: z.string().min(1).max(128),
  message: z.string().min(1).max(1_024),
  requestId: EntityIdSchema,
  details: z.record(z.string(), z.unknown()).nullable(),
}).strict();

export const CatalogQuerySchema = z.object({
  buildingId: EntityIdSchema,
  floorIds: z.array(EntityIdSchema).min(1).optional(),
}).strict();

export const CatalogResponseSchema = DeviceCatalogSchema;

export const StateSnapshotQuerySchema = z.object({
  buildingId: EntityIdSchema,
  floorIds: z.array(EntityIdSchema).min(1).optional(),
}).strict();

export const StateSnapshotSchema = z.object({
  snapshotId: EntityIdSchema,
  buildingId: EntityIdSchema,
  streamId: EntityIdSchema,
  sequence: SequenceSchema,
  generatedAt: TimestampSchema,
  telemetry: z.array(DeviceTelemetrySchema),
  alarms: z.array(AlarmSchema),
  commands: z.array(CommandRecordSchema),
}).strict().superRefine((snapshot, context) => {
  const telemetryIds = new Set<string>();
  for (const telemetry of snapshot.telemetry) {
    if (telemetryIds.has(telemetry.deviceId)) {
      context.addIssue({ code: 'custom', message: `duplicate telemetry device ID: ${telemetry.deviceId}` });
    }
    telemetryIds.add(telemetry.deviceId);
  }

  const alarmIds = new Set<string>();
  for (const alarm of snapshot.alarms) {
    if (alarmIds.has(alarm.id)) {
      context.addIssue({ code: 'custom', message: `duplicate alarm ID: ${alarm.id}` });
    }
    alarmIds.add(alarm.id);
    if (!telemetryIds.has(alarm.deviceId)) {
      context.addIssue({ code: 'custom', message: `alarm ${alarm.id} references an unknown device` });
    }
  }

  const commandIds = new Set<string>();
  for (const command of snapshot.commands) {
    if (commandIds.has(command.id)) {
      context.addIssue({ code: 'custom', message: `duplicate command ID: ${command.id}` });
    }
    commandIds.add(command.id);
    if (!telemetryIds.has(command.deviceId)) {
      context.addIssue({ code: 'custom', message: `command ${command.id} references an unknown device` });
    }
  }
});

export const AcknowledgeAlarmRequestSchema = z.object({
  acknowledgedBy: EntityIdSchema,
  acknowledgedAt: TimestampSchema,
}).strict();

export const AcknowledgeAlarmResponseSchema = z.object({
  alarm: AlarmSchema,
}).strict();

export const CreateCommandRequestSchema = z.object({
  clientRequestId: EntityIdSchema,
  deviceId: EntityIdSchema,
  intent: CommandIntentSchema,
  requestedAt: TimestampSchema,
  requestedBy: EntityIdSchema,
  confirmation: CommandConfirmationSchema.nullable(),
}).strict();

export const CreateCommandResponseSchema = z.object({
  command: CommandRecordSchema,
}).strict();

export const CommandResponseSchema = CreateCommandResponseSchema;

export type ApiError = z.infer<typeof ApiErrorSchema>;
export type CatalogQuery = z.infer<typeof CatalogQuerySchema>;
export type StateSnapshotQuery = z.infer<typeof StateSnapshotQuerySchema>;
export type StateSnapshot = z.infer<typeof StateSnapshotSchema>;
export type AcknowledgeAlarmRequest = z.infer<typeof AcknowledgeAlarmRequestSchema>;
export type AcknowledgeAlarmResponse = z.infer<typeof AcknowledgeAlarmResponseSchema>;
export type CreateCommandRequest = z.infer<typeof CreateCommandRequestSchema>;
