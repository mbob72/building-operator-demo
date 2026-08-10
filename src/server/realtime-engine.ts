import { randomUUID } from 'node:crypto';
import {
  AlarmSchema,
  CommandRecordSchema,
  DeviceTelemetryPatchSchema,
  DeviceTelemetrySchema,
  type Alarm,
  type CommandRecord,
  type CommandIntent,
  type DeviceMetadata,
  type DeviceTelemetry,
  type DeviceTelemetryPatch,
  type TelemetryScalar,
} from '../shared/domain-contracts.js';
import {
  StateSnapshotSchema,
  type AcknowledgeAlarmRequest,
  type CreateCommandRequest,
  type StateSnapshot,
} from '../shared/api-contracts.js';
import {
  EventBatchMessageSchema,
  type RealtimeEvent,
  type SequencedRealtimeEvent,
} from '../shared/realtime-contracts.js';
import { deviceCatalog } from './device-catalog.js';
import {
  deviceFloorById,
  initialTelemetry,
} from './state-snapshot.js';
import { initialAlarms } from './initial-alarms.js';

export const REALTIME_HEARTBEAT_INTERVAL_MS = 5_000;
export const REALTIME_SIMULATOR_INTERVAL_MS = 250;
export const REALTIME_SIMULATOR_BATCH_SIZE = 24;
export const REALTIME_REPLAY_LIMIT = 5_000;

type EventBatch = ReturnType<typeof EventBatchMessageSchema.parse>;
type RealtimeListener = (batch: EventBatch) => void;

interface RealtimeEngineOptions {
  streamId?: string;
  replayLimit?: number;
  now?: () => Date;
  commandAcceptanceDelayMs?: number;
  commandCompletionDelayMs?: number;
  commandTelemetryDelayMs?: number;
  commandOutcome?: (request: CreateCommandRequest) => 'executed' | 'failed' | 'timedOut';
}

const DEFAULT_COMMAND_ACCEPTANCE_DELAY_MS = 350;
const DEFAULT_COMMAND_COMPLETION_DELAY_MS = 1_200;
const DEFAULT_COMMAND_TELEMETRY_DELAY_MS = 650;

const telemetryKeyForIntent = (device: DeviceMetadata, intent: CommandIntent) => {
  const channels = device.capabilities.telemetry;
  if (intent.kind === 'setOnOff') {
    return channels.find((channel) => channel.key === 'on' && channel.valueType === 'boolean')?.key
      ?? channels.find((channel) => channel.valueType === 'boolean')?.key;
  }
  return channels.find((channel) => channel.key === 'setpoint' && channel.valueType === 'number')?.key
    ?? channels.find((channel) => channel.key === 'level' && channel.valueType === 'number')?.key
    ?? channels.find((channel) => channel.valueType === 'number')?.key;
};

const nextValue = (value: TelemetryScalar, revision: number): TelemetryScalar => {
  if (typeof value === 'boolean') return !value;
  if (typeof value === 'number') return Math.round((value + 0.1) * 10) / 10;
  if (typeof value === 'string') return `value-${revision % 10}`;
  return value;
};

const canTransitionAlarm = (current: Alarm, next: Alarm) => {
  if (current.deviceId !== next.deviceId
    || current.severity !== next.severity
    || current.code !== next.code
    || current.createdAt !== next.createdAt) return false;
  if (current.state === 'active') return true;
  if (current.state === 'acknowledged') return next.state !== 'active';
  return next.state === 'resolved';
};

const scopeIdFor = (floorIds: readonly string[]) => {
  const selected = new Set(floorIds);
  if (selected.size === deviceCatalog.floors.length
    && deviceCatalog.floors.every((floor) => selected.has(floor.id))) {
    return 'building';
  }
  if (floorIds.length === 1) return floorIds[0] ?? 'empty';
  return floorIds.map((floorId) => floorId.replace('west-riverside-', '')).join(',');
};

export class RealtimeEngine {
  readonly streamId: string;
  readonly replayLimit: number;
  private readonly now: () => Date;
  private readonly commandAcceptanceDelayMs: number;
  private readonly commandCompletionDelayMs: number;
  private readonly commandTelemetryDelayMs: number;
  private readonly commandOutcome: NonNullable<RealtimeEngineOptions['commandOutcome']>;
  private readonly telemetryByDeviceId: Map<string, DeviceTelemetry>;
  private readonly alarmsById = new Map<string, Alarm>(
    initialAlarms.map((alarm) => [alarm.id, alarm]),
  );
  private readonly commandsById = new Map<string, CommandRecord>();
  private readonly commandIdByClientRequestId = new Map<string, string>();
  private readonly commandRequestByClientRequestId = new Map<string, CreateCommandRequest>();
  private readonly commandTimers = new Set<ReturnType<typeof setTimeout>>();
  private readonly listeners = new Set<RealtimeListener>();
  private replay: SequencedRealtimeEvent[] = [];
  private sequence = 0;
  private simulatorCursor = 0;
  private simulatorTimer: ReturnType<typeof setInterval> | undefined;

  constructor(options: RealtimeEngineOptions = {}) {
    this.streamId = options.streamId ?? `stage-8-9-${randomUUID()}`;
    this.replayLimit = options.replayLimit ?? REALTIME_REPLAY_LIMIT;
    this.now = options.now ?? (() => new Date());
    this.commandAcceptanceDelayMs = options.commandAcceptanceDelayMs
      ?? DEFAULT_COMMAND_ACCEPTANCE_DELAY_MS;
    this.commandCompletionDelayMs = options.commandCompletionDelayMs
      ?? DEFAULT_COMMAND_COMPLETION_DELAY_MS;
    this.commandTelemetryDelayMs = options.commandTelemetryDelayMs
      ?? DEFAULT_COMMAND_TELEMETRY_DELAY_MS;
    let commandOrdinal = 0;
    this.commandOutcome = options.commandOutcome ?? (() => {
      commandOrdinal += 1;
      if (commandOrdinal % 10 === 9) return 'failed';
      if (commandOrdinal % 10 === 0) return 'timedOut';
      return 'executed';
    });
    this.telemetryByDeviceId = new Map(initialTelemetry.map((item) => [item.deviceId, item]));
  }

  get latestSequence() {
    return this.sequence;
  }

  get retentionStartSequence() {
    return this.replay[0]?.sequence ?? this.sequence + 1;
  }

  getTelemetry(deviceId: string) {
    return this.telemetryByDeviceId.get(deviceId);
  }

  getAlarm(alarmId: string) {
    return this.alarmsById.get(alarmId);
  }

  getCommand(commandId: string) {
    return this.commandsById.get(commandId);
  }

  snapshot(floorIds: readonly string[]): StateSnapshot {
    const selectedFloorIds = new Set(floorIds);
    const telemetry = [...this.telemetryByDeviceId.values()].filter((item) => {
      const floorId = deviceFloorById.get(item.deviceId);
      return floorId !== undefined && selectedFloorIds.has(floorId);
    });
    const selectedDeviceIds = new Set(telemetry.map((item) => item.deviceId));
    return StateSnapshotSchema.parse({
      snapshotId: `stage-8-9-live-snapshot-v1:${this.sequence}:${scopeIdFor(floorIds)}`,
      buildingId: deviceCatalog.building.id,
      streamId: this.streamId,
      sequence: this.sequence,
      generatedAt: this.now().toISOString(),
      telemetry,
      alarms: [...this.alarmsById.values()].filter((alarm) => selectedDeviceIds.has(alarm.deviceId)),
      commands: [...this.commandsById.values()].filter((command) => selectedDeviceIds.has(command.deviceId)),
    });
  }

  subscribe(listener: RealtimeListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  replayAfter(afterSequence: number): SequencedRealtimeEvent[] | undefined {
    if (afterSequence > this.sequence) return undefined;
    if (afterSequence < this.retentionStartSequence - 1) return undefined;
    return this.replay.filter((event) => event.sequence > afterSequence);
  }

  private publishEvents(rawEvents: readonly RealtimeEvent[]): EventBatch | undefined {
    if (rawEvents.length === 0) return undefined;
    const events = rawEvents.map((event): SequencedRealtimeEvent => ({
      sequence: ++this.sequence,
      event,
    }));
    this.replay.push(...events);
    if (this.replay.length > this.replayLimit) {
      this.replay.splice(0, this.replay.length - this.replayLimit);
    }

    const batch = EventBatchMessageSchema.parse({
      type: 'event.batch',
      streamId: this.streamId,
      emittedAt: this.now().toISOString(),
      fromSequence: events[0]!.sequence,
      toSequence: events.at(-1)!.sequence,
      events,
    });
    for (const listener of this.listeners) listener(batch);
    return batch;
  }

  publishTelemetryPatches(rawPatches: readonly DeviceTelemetryPatch[]): EventBatch | undefined {
    const acceptedPatches: DeviceTelemetryPatch[] = [];
    for (const rawPatch of rawPatches) {
      const patch = DeviceTelemetryPatchSchema.parse(rawPatch);
      const current = this.telemetryByDeviceId.get(patch.deviceId);
      if (!current || patch.revision <= current.revision) continue;
      const next = DeviceTelemetrySchema.parse({
        ...current,
        ...patch,
        values: patch.values ? { ...current.values, ...patch.values } : current.values,
      });
      this.telemetryByDeviceId.set(next.deviceId, next);
      acceptedPatches.push(patch);
    }
    if (acceptedPatches.length === 0) return undefined;

    return this.publishEvents(acceptedPatches.map((patch) => ({
      type: 'telemetry.patch' as const,
      payload: patch,
    })));
  }

  publishAlarmUpserts(rawAlarms: readonly Alarm[]): EventBatch | undefined {
    const acceptedAlarms: Alarm[] = [];
    for (const rawAlarm of rawAlarms) {
      const alarm = AlarmSchema.parse(rawAlarm);
      if (!this.telemetryByDeviceId.has(alarm.deviceId)) continue;
      const current = this.alarmsById.get(alarm.id);
      if ((!current && alarm.state !== 'active') || (current && !canTransitionAlarm(current, alarm))) {
        continue;
      }
      if (current && JSON.stringify(current) === JSON.stringify(alarm)) continue;
      this.alarmsById.set(alarm.id, alarm);
      acceptedAlarms.push(alarm);
    }
    return this.publishEvents(acceptedAlarms.map((alarm) => ({
      type: 'alarm.upsert' as const,
      payload: alarm,
    })));
  }

  acknowledgeAlarm(alarmId: string, request: AcknowledgeAlarmRequest) {
    const current = this.alarmsById.get(alarmId);
    if (!current) return { status: 'not-found' as const };
    if (current.state === 'resolved') return { status: 'resolved' as const, alarm: current };
    if (current.state === 'acknowledged') {
      return { status: 'acknowledged' as const, alarm: current };
    }
    const alarm = AlarmSchema.parse({
      ...current,
      state: 'acknowledged',
      updatedAt: request.acknowledgedAt,
      acknowledgedAt: request.acknowledgedAt,
      acknowledgedBy: request.acknowledgedBy,
    });
    this.publishAlarmUpserts([alarm]);
    return { status: 'acknowledged' as const, alarm };
  }

  private publishCommand(command: CommandRecord) {
    const parsed = CommandRecordSchema.parse(command);
    this.commandsById.set(parsed.id, parsed);
    this.publishEvents([{ type: 'command.upsert', payload: parsed }]);
    return parsed;
  }

  private scheduleCommandTransition(delayMs: number, transition: () => void) {
    const timer = setTimeout(() => {
      this.commandTimers.delete(timer);
      transition();
    }, delayMs);
    timer.unref?.();
    this.commandTimers.add(timer);
  }

  createCommand(request: CreateCommandRequest) {
    const existingId = this.commandIdByClientRequestId.get(request.clientRequestId);
    if (existingId) {
      const existing = this.commandsById.get(existingId)!;
      const originalRequest = this.commandRequestByClientRequestId.get(request.clientRequestId);
      return JSON.stringify(originalRequest) === JSON.stringify(request)
        ? { status: 'created' as const, command: existing }
        : { status: 'idempotency-conflict' as const, command: existing };
    }

    const device = deviceCatalog.devices.find((item) => item.id === request.deviceId);
    if (!device) return { status: 'device-not-found' as const };
    const capability = device.capabilities.commands.find((item) => item.kind === request.intent.kind);
    if (!capability) return { status: 'unsupported-command' as const };
    if (capability.kind === 'setSetpoint' && request.intent.kind === 'setSetpoint') {
      const { value } = request.intent;
      const alignedSteps = (value - capability.minimum) / capability.step;
      if (value < capability.minimum
        || value > capability.maximum
        || Math.abs(alignedSteps - Math.round(alignedSteps)) > 1e-8) {
        return { status: 'invalid-setpoint' as const, capability };
      }
    }
    if (capability.requiresConfirmation && request.confirmation === null) {
      return { status: 'confirmation-required' as const };
    }
    if (request.confirmation
      && (request.confirmation.confirmedBy !== request.requestedBy
        || Date.parse(request.confirmation.confirmedAt) < Date.parse(request.requestedAt))) {
      return { status: 'invalid-confirmation' as const };
    }

    const command = CommandRecordSchema.parse({
      id: `command-${randomUUID()}`,
      ...request,
      state: 'pending',
      acceptedAt: null,
      executedAt: null,
      failedAt: null,
      timedOutAt: null,
      failure: null,
      resultTelemetryRevision: null,
    });
    this.commandIdByClientRequestId.set(request.clientRequestId, command.id);
    this.commandRequestByClientRequestId.set(request.clientRequestId, request);
    this.publishCommand(command);

    this.scheduleCommandTransition(this.commandAcceptanceDelayMs, () => {
      const current = this.commandsById.get(command.id);
      if (!current || current.state !== 'pending') return;
      const accepted = this.publishCommand({
        ...current,
        state: 'accepted',
        acceptedAt: this.now().toISOString(),
      });
      this.scheduleCommandTransition(this.commandCompletionDelayMs, () => {
        const latest = this.commandsById.get(command.id);
        if (!latest || latest.state !== 'accepted') return;
        const timestamp = this.now().toISOString();
        const outcome = this.commandOutcome(request);
        if (outcome === 'executed') {
          this.publishCommand({
            ...latest,
            state: 'executed',
            executedAt: timestamp,
            resultTelemetryRevision: null,
          });
          this.scheduleCommandTransition(this.commandTelemetryDelayMs, () => {
            const executed = this.commandsById.get(command.id);
            const telemetry = this.telemetryByDeviceId.get(command.deviceId);
            if (!executed || executed.state !== 'executed' || !telemetry) return;
            const telemetryKey = telemetryKeyForIntent(device, request.intent);
            if (!telemetryKey) return;
            const revision = telemetry.revision + 1;
            const telemetryTimestamp = this.now().toISOString();
            const patch = this.publishTelemetryPatches([{
              deviceId: command.deviceId,
              revision,
              observedAt: telemetryTimestamp,
              receivedAt: telemetryTimestamp,
              values: { [telemetryKey]: request.intent.value },
            }]);
            if (!patch) return;
            this.publishCommand({ ...executed, resultTelemetryRevision: revision });
          });
        } else if (outcome === 'failed') {
          this.publishCommand({
            ...accepted,
            state: 'failed',
            failedAt: timestamp,
            failure: {
              code: 'SIMULATED_EXECUTION_FAILED',
              message: 'The simulated controller rejected command execution',
            },
          });
        } else {
          this.publishCommand({ ...accepted, state: 'timedOut', timedOutAt: timestamp });
        }
      });
    });

    return { status: 'created' as const, command };
  }

  generateSimulatorBatch(batchSize = REALTIME_SIMULATOR_BATCH_SIZE) {
    const patches: DeviceTelemetryPatch[] = [];
    for (let offset = 0; offset < batchSize; offset += 1) {
      const index = (this.simulatorCursor + offset) % deviceCatalog.devices.length;
      const device = deviceCatalog.devices[index];
      if (!device) continue;
      const current = this.telemetryByDeviceId.get(device.id);
      if (!current) continue;
      const revision = current.revision + 1;
      const firstValue = Object.entries(current.values)[0];
      const values = firstValue
        ? { [firstValue[0]]: nextValue(firstValue[1], revision) }
        : undefined;
      const changesStatus = index % 2_048 === 0;
      const nextStatus = current.status === 'normal' ? 'warning' : 'normal';
      const timestamp = this.now().toISOString();
      patches.push({
        deviceId: device.id,
        revision,
        observedAt: timestamp,
        receivedAt: timestamp,
        ...(values ? { values } : { connection: current.connection }),
        ...(changesStatus ? {
          status: nextStatus,
          connection: 'online' as const,
        } : {}),
      });
    }
    this.simulatorCursor = (this.simulatorCursor + batchSize) % deviceCatalog.devices.length;
    return this.publishTelemetryPatches(patches);
  }

  startSimulator(
    intervalMs = REALTIME_SIMULATOR_INTERVAL_MS,
    batchSize = REALTIME_SIMULATOR_BATCH_SIZE,
  ) {
    if (this.simulatorTimer) return;
    this.simulatorTimer = setInterval(() => this.generateSimulatorBatch(batchSize), intervalMs);
    this.simulatorTimer.unref?.();
  }

  stopSimulator() {
    if (this.simulatorTimer) {
      clearInterval(this.simulatorTimer);
      this.simulatorTimer = undefined;
    }
    for (const timer of this.commandTimers) clearTimeout(timer);
    this.commandTimers.clear();
  }
}
