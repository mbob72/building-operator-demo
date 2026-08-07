import { z } from 'zod';
import {
  AlarmSchema,
  CommandRecordSchema,
  DeviceTelemetryPatchSchema,
  EntityIdSchema,
  SequenceSchema,
  TimestampSchema,
} from './domain-contracts.js';

export const RealtimeProtocolVersionSchema = z.literal('1');

export const RealtimeEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('telemetry.patch'),
    payload: DeviceTelemetryPatchSchema,
  }).strict(),
  z.object({
    type: z.literal('alarm.upsert'),
    payload: AlarmSchema,
  }).strict(),
  z.object({
    type: z.literal('command.upsert'),
    payload: CommandRecordSchema,
  }).strict(),
  z.object({
    type: z.literal('catalog.invalidated'),
    payload: z.object({ catalogVersion: EntityIdSchema }).strict(),
  }).strict(),
]);

export const SequencedRealtimeEventSchema = z.object({
  sequence: SequenceSchema,
  event: RealtimeEventSchema,
}).strict();

export const SubscribeMessageSchema = z.object({
  type: z.literal('subscribe'),
  protocolVersion: RealtimeProtocolVersionSchema,
  buildingId: EntityIdSchema,
  floorIds: z.array(EntityIdSchema).min(1).optional(),
}).strict();

export const ResumeMessageSchema = z.object({
  type: z.literal('resume'),
  protocolVersion: RealtimeProtocolVersionSchema,
  buildingId: EntityIdSchema,
  streamId: EntityIdSchema,
  afterSequence: SequenceSchema,
  floorIds: z.array(EntityIdSchema).min(1).optional(),
}).strict();

export const ClientRealtimeMessageSchema = z.discriminatedUnion('type', [
  SubscribeMessageSchema,
  ResumeMessageSchema,
]);

export const HelloMessageSchema = z.object({
  type: z.literal('hello'),
  protocolVersion: RealtimeProtocolVersionSchema,
  connectionId: EntityIdSchema,
  streamId: EntityIdSchema,
  latestSequence: SequenceSchema,
  retentionStartSequence: SequenceSchema,
  heartbeatIntervalMs: z.number().int().positive(),
}).strict();

export const EventBatchMessageSchema = z.object({
  type: z.literal('event.batch'),
  streamId: EntityIdSchema,
  emittedAt: TimestampSchema,
  fromSequence: SequenceSchema,
  toSequence: SequenceSchema,
  events: z.array(SequencedRealtimeEventSchema).min(1).max(5_000),
}).strict().superRefine((batch, context) => {
  const first = batch.events[0];
  const last = batch.events.at(-1);
  if (first?.sequence !== batch.fromSequence || last?.sequence !== batch.toSequence) {
    context.addIssue({ code: 'custom', message: 'batch range must match event sequences' });
  }
  for (let index = 1; index < batch.events.length; index += 1) {
    const previous = batch.events[index - 1];
    const current = batch.events[index];
    if (previous === undefined || current === undefined || current.sequence !== previous.sequence + 1) {
      context.addIssue({ code: 'custom', message: 'event sequences must be contiguous' });
      break;
    }
  }
});

export const ResyncRequiredMessageSchema = z.object({
  type: z.literal('resync.required'),
  streamId: EntityIdSchema,
  latestSequence: SequenceSchema,
  reason: z.enum(['cursorExpired', 'streamChanged', 'serverRestart']),
  snapshotPath: z.string().startsWith('/api/'),
}).strict();

export const HeartbeatMessageSchema = z.object({
  type: z.literal('heartbeat'),
  streamId: EntityIdSchema,
  latestSequence: SequenceSchema,
  sentAt: TimestampSchema,
}).strict();

export const ServerRealtimeMessageSchema = z.discriminatedUnion('type', [
  HelloMessageSchema,
  EventBatchMessageSchema,
  ResyncRequiredMessageSchema,
  HeartbeatMessageSchema,
]);

export type RealtimeEvent = z.infer<typeof RealtimeEventSchema>;
export type SequencedRealtimeEvent = z.infer<typeof SequencedRealtimeEventSchema>;
export type ClientRealtimeMessage = z.infer<typeof ClientRealtimeMessageSchema>;
export type ServerRealtimeMessage = z.infer<typeof ServerRealtimeMessageSchema>;
