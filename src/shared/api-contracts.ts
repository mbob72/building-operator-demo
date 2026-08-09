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
}).strict();

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
export type CreateCommandRequest = z.infer<typeof CreateCommandRequestSchema>;
