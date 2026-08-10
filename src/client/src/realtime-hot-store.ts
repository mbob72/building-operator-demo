import {
  AlarmSchema,
  CommandRecordSchema,
  DeviceTelemetrySchema,
  type Alarm,
  type CommandRecord,
  type DeviceStatus,
  type DeviceTelemetry,
} from '../../shared/domain-contracts';
import type { StateSnapshot } from '../../shared/api-contracts';
import type { ServerRealtimeMessage } from '../../shared/realtime-contracts';
import { isPriorityStatus } from './device-visuals';
import { recordRealtimeBatch } from './performance-metrics';

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
}

const commandStateRank: Record<CommandRecord['state'], number> = {
  pending: 0,
  accepted: 1,
  executed: 2,
  failed: 2,
  timedOut: 2,
};

const alarmStateRank: Record<Alarm['state'], number> = {
  active: 0,
  acknowledged: 1,
  resolved: 2,
};

type ReconcileResult<T> = { status: 'use-current' | 'use-next'; value: T }
  | { status: 'invalid' };

const reconcileAlarm = (current: Alarm | undefined, next: Alarm): ReconcileResult<Alarm> => {
  if (!current) return { status: 'use-next', value: next };
  if (current.deviceId !== next.deviceId
    || current.severity !== next.severity
    || current.code !== next.code
    || current.createdAt !== next.createdAt) return { status: 'invalid' };
  if (JSON.stringify(current) === JSON.stringify(next)) {
    return { status: 'use-current', value: current };
  }
  if (next.updatedAt < current.updatedAt
    || alarmStateRank[next.state] < alarmStateRank[current.state]) {
    return { status: 'use-current', value: current };
  }
  if (next.updatedAt === current.updatedAt && next.state === current.state) {
    return { status: 'invalid' };
  }
  return { status: 'use-next', value: next };
};

const reconcileCommand = (
  current: CommandRecord | undefined,
  next: CommandRecord,
): ReconcileResult<CommandRecord> => {
  if (!current) return { status: 'use-next', value: next };
  if (current.clientRequestId !== next.clientRequestId
    || current.deviceId !== next.deviceId
    || JSON.stringify(current.intent) !== JSON.stringify(next.intent)
    || current.requestedAt !== next.requestedAt
    || current.requestedBy !== next.requestedBy
    || JSON.stringify(current.confirmation) !== JSON.stringify(next.confirmation)) {
    return { status: 'invalid' };
  }
  if (JSON.stringify(current) === JSON.stringify(next)) {
    return { status: 'use-current', value: current };
  }
  const currentRank = commandStateRank[current.state];
  const nextRank = commandStateRank[next.state];
  if (nextRank < currentRank) return { status: 'use-current', value: current };
  if (nextRank === currentRank && current.state !== next.state) return { status: 'invalid' };
  if (current.state === 'executed' && next.state === 'executed') {
    if (current.resultTelemetryRevision !== null && next.resultTelemetryRevision === null) {
      return { status: 'use-current', value: current };
    }
    if (current.resultTelemetryRevision !== null
      && next.resultTelemetryRevision !== null
      && current.resultTelemetryRevision !== next.resultTelemetryRevision) {
      return { status: 'invalid' };
    }
  } else if (nextRank === currentRank) {
    return { status: 'invalid' };
  }
  return { status: 'use-next', value: next };
};

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

  upsertAlarm(alarm: Alarm) {
    const parsed = AlarmSchema.parse(alarm);
    const current = this.snapshot.alarmsById.get(parsed.id);
    if (!this.snapshot.telemetryByDeviceId.has(parsed.deviceId)) return;
    const reconciled = reconcileAlarm(current, parsed);
    if (reconciled.status !== 'use-next') return;
    const alarmsById = new Map(this.snapshot.alarmsById);
    alarmsById.set(parsed.id, reconciled.value);
    this.publish({
      ...this.snapshot,
      alarmsById,
      version: this.snapshot.version + 1,
    });
  }

  upsertCommand(command: CommandRecord) {
    const parsed = CommandRecordSchema.parse(command);
    const current = this.snapshot.commandsById.get(parsed.id);
    if (!this.snapshot.telemetryByDeviceId.has(parsed.deviceId)) return;
    const reconciled = reconcileCommand(current, parsed);
    if (reconciled.status !== 'use-next') return;
    const commandsById = new Map(this.snapshot.commandsById);
    commandsById.set(parsed.id, reconciled.value);
    this.publish({
      ...this.snapshot,
      commandsById,
      version: this.snapshot.version + 1,
    });
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
    const applyStartedAt = performance.now();
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
        if (!(telemetryByDeviceId ?? this.snapshot.telemetryByDeviceId)
          .has(event.payload.deviceId)) return 'invalid-state';
        const current = (alarmsById ?? this.snapshot.alarmsById).get(event.payload.id);
        const reconciled = reconcileAlarm(current, event.payload);
        if (reconciled.status === 'invalid') return 'invalid-state';
        if (reconciled.status === 'use-current') continue;
        alarmsById ??= new Map(this.snapshot.alarmsById);
        alarmsById.set(event.payload.id, reconciled.value);
      } else if (event.type === 'command.upsert') {
        if (!(telemetryByDeviceId ?? this.snapshot.telemetryByDeviceId)
          .has(event.payload.deviceId)) return 'invalid-state';
        const current = (commandsById ?? this.snapshot.commandsById).get(event.payload.id);
        const reconciled = reconcileCommand(current, event.payload);
        if (reconciled.status === 'invalid') return 'invalid-state';
        if (reconciled.status === 'use-current') continue;
        commandsById ??= new Map(this.snapshot.commandsById);
        commandsById.set(event.payload.id, reconciled.value);
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
    });
    recordRealtimeBatch(
      freshEvents.length,
      batch.emittedAt,
      performance.now() - applyStartedAt,
    );
    return 'applied';
  }
}

export const operatorRealtimeStore = new RealtimeHotStore();
