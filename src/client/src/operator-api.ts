import {
  AcknowledgeAlarmResponseSchema,
  CatalogResponseSchema,
  CommandResponseSchema,
  CreateCommandResponseSchema,
  StateSnapshotSchema,
  type AcknowledgeAlarmRequest,
  type CreateCommandRequest,
  type StateSnapshot,
} from '../../shared/api-contracts';
import type { Alarm, CommandRecord, DeviceCatalog } from '../../shared/domain-contracts';

const scopeParameters = (floorIds?: string[]): URLSearchParams => {
  const parameters = new URLSearchParams({ buildingId: 'west-riverside' });
  for (const floorId of floorIds ?? []) parameters.append('floorIds', floorId);
  return parameters;
};

export const loadDeviceCatalog = async (
  floorIds?: string[],
  signal?: AbortSignal,
): Promise<DeviceCatalog> => {
  const response = await fetch(
    `/api/v1/catalog?${scopeParameters(floorIds)}`,
    signal ? { signal } : undefined,
  );
  if (!response.ok) throw new Error(`Device catalog request failed: ${response.status}`);
  return CatalogResponseSchema.parse(await response.json());
};

export const loadStateSnapshot = async (
  floorIds?: string[],
  signal?: AbortSignal,
): Promise<StateSnapshot> => {
  const response = await fetch(
    `/api/v1/state/snapshot?${scopeParameters(floorIds)}`,
    signal ? { signal } : undefined,
  );
  if (!response.ok) throw new Error(`State snapshot request failed: ${response.status}`);
  return StateSnapshotSchema.parse(await response.json());
};

export const loadStateSnapshotPath = async (
  path: string,
  signal?: AbortSignal,
): Promise<StateSnapshot> => {
  const response = await fetch(path, signal ? { signal } : undefined);
  if (!response.ok) throw new Error(`State resync request failed: ${response.status}`);
  return StateSnapshotSchema.parse(await response.json());
};

export const acknowledgeAlarm = async (
  alarmId: string,
  request: AcknowledgeAlarmRequest,
): Promise<Alarm> => {
  const response = await fetch(`/api/v1/alarms/${encodeURIComponent(alarmId)}/acknowledge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`Alarm acknowledgement failed: ${response.status}`);
  return AcknowledgeAlarmResponseSchema.parse(await response.json()).alarm;
};

export const createCommand = async (request: CreateCommandRequest): Promise<CommandRecord> => {
  const response = await fetch('/api/v1/commands', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`Command request failed: ${response.status}`);
  return CreateCommandResponseSchema.parse(await response.json()).command;
};

export const loadCommand = async (commandId: string): Promise<CommandRecord> => {
  const response = await fetch(`/api/v1/commands/${encodeURIComponent(commandId)}`);
  if (!response.ok) throw new Error(`Command status request failed: ${response.status}`);
  return CommandResponseSchema.parse(await response.json()).command;
};
