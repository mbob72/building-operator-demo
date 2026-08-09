import { randomUUID } from 'node:crypto';
import {
  DeviceTelemetryPatchSchema,
  DeviceTelemetrySchema,
  type Alarm,
  type CommandRecord,
  type DeviceTelemetry,
  type DeviceTelemetryPatch,
  type TelemetryScalar,
} from '../shared/domain-contracts.js';
import { StateSnapshotSchema, type StateSnapshot } from '../shared/api-contracts.js';
import {
  EventBatchMessageSchema,
  type SequencedRealtimeEvent,
} from '../shared/realtime-contracts.js';
import { deviceCatalog } from './device-catalog.js';
import {
  deviceFloorById,
  initialTelemetry,
} from './state-snapshot.js';

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
}

const nextValue = (value: TelemetryScalar, revision: number): TelemetryScalar => {
  if (typeof value === 'boolean') return !value;
  if (typeof value === 'number') return Math.round((value + 0.1) * 10) / 10;
  if (typeof value === 'string') return `value-${revision % 10}`;
  return value;
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
  private readonly telemetryByDeviceId: Map<string, DeviceTelemetry>;
  private readonly alarmsById = new Map<string, Alarm>();
  private readonly commandsById = new Map<string, CommandRecord>();
  private readonly listeners = new Set<RealtimeListener>();
  private replay: SequencedRealtimeEvent[] = [];
  private sequence = 0;
  private simulatorCursor = 0;
  private simulatorTimer: ReturnType<typeof setInterval> | undefined;

  constructor(options: RealtimeEngineOptions = {}) {
    this.streamId = options.streamId ?? `stage-5-${randomUUID()}`;
    this.replayLimit = options.replayLimit ?? REALTIME_REPLAY_LIMIT;
    this.now = options.now ?? (() => new Date());
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

  snapshot(floorIds: readonly string[]): StateSnapshot {
    const selectedFloorIds = new Set(floorIds);
    const telemetry = [...this.telemetryByDeviceId.values()].filter((item) => {
      const floorId = deviceFloorById.get(item.deviceId);
      return floorId !== undefined && selectedFloorIds.has(floorId);
    });
    return StateSnapshotSchema.parse({
      snapshotId: `stage-5-live-snapshot-v1:${this.sequence}:${scopeIdFor(floorIds)}`,
      buildingId: deviceCatalog.building.id,
      streamId: this.streamId,
      sequence: this.sequence,
      generatedAt: this.now().toISOString(),
      telemetry,
      alarms: [...this.alarmsById.values()],
      commands: [...this.commandsById.values()],
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

    const events = acceptedPatches.map((patch): SequencedRealtimeEvent => ({
      sequence: ++this.sequence,
      event: { type: 'telemetry.patch', payload: patch },
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
    if (!this.simulatorTimer) return;
    clearInterval(this.simulatorTimer);
    this.simulatorTimer = undefined;
  }
}
