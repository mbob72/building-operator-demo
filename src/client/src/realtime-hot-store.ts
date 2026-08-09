import {
  DeviceTelemetrySchema,
  type Alarm,
  type CommandRecord,
  type DeviceStatus,
  type DeviceTelemetry,
} from '../../shared/domain-contracts';
import type { StateSnapshot } from '../../shared/api-contracts';
import type { ServerRealtimeMessage } from '../../shared/realtime-contracts';
import { isPriorityStatus } from './device-visuals';

export type RealtimeConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'resyncing'
  | 'error';

type EventBatch = Extract<ServerRealtimeMessage, { type: 'event.batch' }>;
export type ApplyBatchResult =
  | 'applied'
  | 'duplicate'
  | 'gap'
  | 'stream-mismatch'
  | 'invalid-state';

export interface RealtimeHotSnapshot {
  telemetryByDeviceId: ReadonlyMap<string, DeviceTelemetry>;
  statusByDeviceId: ReadonlyMap<string, DeviceStatus>;
  alarmsById: ReadonlyMap<string, Alarm>;
  commandsById: ReadonlyMap<string, CommandRecord>;
  dirtyStatusDeviceIds: ReadonlySet<string>;
  streamId: string | undefined;
  sequence: number;
  ready: boolean;
  connectionStatus: RealtimeConnectionStatus;
  lastMessageAt: string | undefined;
  error: string | undefined;
  version: number;
  statusVersion: number;
  priorityMembershipVersion: number;
  priorityMembershipChanged: boolean;
}

const emptySnapshot = (): RealtimeHotSnapshot => ({
  telemetryByDeviceId: new Map(),
  statusByDeviceId: new Map(),
  alarmsById: new Map(),
  commandsById: new Map(),
  dirtyStatusDeviceIds: new Set(),
  streamId: undefined,
  sequence: 0,
  ready: false,
  connectionStatus: 'idle',
  lastMessageAt: undefined,
  error: undefined,
  version: 0,
  statusVersion: 0,
  priorityMembershipVersion: 0,
  priorityMembershipChanged: false,
});

export class RealtimeHotStore {
  private snapshot = emptySnapshot();
  private readonly listeners = new Set<() => void>();

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(next: RealtimeHotSnapshot) {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  reset() {
    this.publish(emptySnapshot());
  }

  replaceSnapshot(snapshot: StateSnapshot) {
    const telemetryByDeviceId = new Map(
      snapshot.telemetry.map((telemetry) => [telemetry.deviceId, telemetry]),
    );
    const statusByDeviceId = new Map(
      snapshot.telemetry.map((telemetry) => [telemetry.deviceId, telemetry.status]),
    );
    this.publish({
      telemetryByDeviceId,
      statusByDeviceId,
      alarmsById: new Map(snapshot.alarms.map((alarm) => [alarm.id, alarm])),
      commandsById: new Map(snapshot.commands.map((command) => [command.id, command])),
      dirtyStatusDeviceIds: new Set(statusByDeviceId.keys()),
      streamId: snapshot.streamId,
      sequence: snapshot.sequence,
      ready: true,
      connectionStatus: this.snapshot.connectionStatus === 'resyncing' ? 'resyncing' : 'connecting',
      lastMessageAt: snapshot.generatedAt,
      error: undefined,
      version: this.snapshot.version + 1,
      statusVersion: this.snapshot.statusVersion + 1,
      priorityMembershipVersion: this.snapshot.priorityMembershipVersion + 1,
      priorityMembershipChanged: true,
    });
  }

  setConnection(connectionStatus: RealtimeConnectionStatus, error?: string) {
    if (this.snapshot.connectionStatus === connectionStatus && this.snapshot.error === error) return;
    this.publish({
      ...this.snapshot,
      connectionStatus,
      error,
      version: this.snapshot.version + 1,
    });
  }

  markHeartbeat(streamId: string, latestSequence: number, receivedAt: string) {
    if (streamId !== this.snapshot.streamId || latestSequence > this.snapshot.sequence) return false;
    this.publish({
      ...this.snapshot,
      connectionStatus: 'live',
      lastMessageAt: receivedAt,
      error: undefined,
      version: this.snapshot.version + 1,
    });
    return true;
  }

  applyBatch(batch: EventBatch): ApplyBatchResult {
    if (batch.streamId !== this.snapshot.streamId) return 'stream-mismatch';
    if (batch.toSequence <= this.snapshot.sequence) return 'duplicate';
    const freshEvents = batch.events.filter((item) => item.sequence > this.snapshot.sequence);
    if (freshEvents[0]?.sequence !== this.snapshot.sequence + 1) return 'gap';

    let telemetryByDeviceId: Map<string, DeviceTelemetry> | undefined;
    let statusByDeviceId: Map<string, DeviceStatus> | undefined;
    let alarmsById: Map<string, Alarm> | undefined;
    let commandsById: Map<string, CommandRecord> | undefined;
    const dirtyStatusDeviceIds = new Set<string>();
    let statusChanged = false;
    let priorityMembershipChanged = false;

    for (const item of freshEvents) {
      const { event } = item;
      if (event.type === 'telemetry.patch') {
        const current = (telemetryByDeviceId ?? this.snapshot.telemetryByDeviceId)
          .get(event.payload.deviceId);
        if (!current) return 'invalid-state';
        if (event.payload.revision <= current.revision) continue;
        const parsed = DeviceTelemetrySchema.safeParse({
          ...current,
          ...event.payload,
          values: event.payload.values
            ? { ...current.values, ...event.payload.values }
            : current.values,
        });
        if (!parsed.success) return 'invalid-state';
        telemetryByDeviceId ??= new Map(this.snapshot.telemetryByDeviceId);
        telemetryByDeviceId.set(parsed.data.deviceId, parsed.data);
        if (parsed.data.status !== current.status) {
          statusByDeviceId ??= new Map(this.snapshot.statusByDeviceId);
          statusByDeviceId.set(parsed.data.deviceId, parsed.data.status);
          dirtyStatusDeviceIds.add(parsed.data.deviceId);
          statusChanged = true;
          if (isPriorityStatus(parsed.data.status) !== isPriorityStatus(current.status)) {
            priorityMembershipChanged = true;
          }
        }
      } else if (event.type === 'alarm.upsert') {
        alarmsById ??= new Map(this.snapshot.alarmsById);
        alarmsById.set(event.payload.id, event.payload);
      } else if (event.type === 'command.upsert') {
        commandsById ??= new Map(this.snapshot.commandsById);
        commandsById.set(event.payload.id, event.payload);
      }
    }

    this.publish({
      ...this.snapshot,
      telemetryByDeviceId: telemetryByDeviceId ?? this.snapshot.telemetryByDeviceId,
      statusByDeviceId: statusByDeviceId ?? this.snapshot.statusByDeviceId,
      alarmsById: alarmsById ?? this.snapshot.alarmsById,
      commandsById: commandsById ?? this.snapshot.commandsById,
      dirtyStatusDeviceIds: statusChanged
        ? dirtyStatusDeviceIds
        : this.snapshot.dirtyStatusDeviceIds,
      sequence: batch.toSequence,
      connectionStatus: 'live',
      lastMessageAt: batch.emittedAt,
      error: undefined,
      version: this.snapshot.version + 1,
      statusVersion: this.snapshot.statusVersion + (statusChanged ? 1 : 0),
      priorityMembershipVersion: this.snapshot.priorityMembershipVersion
        + (priorityMembershipChanged ? 1 : 0),
      priorityMembershipChanged: statusChanged
        ? priorityMembershipChanged
        : this.snapshot.priorityMembershipChanged,
    });
    return 'applied';
  }
}

export const operatorRealtimeStore = new RealtimeHotStore();
