import {
  CatalogResponseSchema,
  StateSnapshotSchema,
  type StateSnapshot,
} from '../../shared/api-contracts';
import type { DeviceCatalog } from '../../shared/domain-contracts';

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
