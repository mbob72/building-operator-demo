import {
  CatalogResponseSchema,
  type CatalogQuery,
} from '../../shared/api-contracts';
import type { DeviceCatalog } from '../../shared/domain-contracts';

export const loadDeviceCatalog = async (
  floorId: string,
  signal?: AbortSignal,
): Promise<DeviceCatalog> => {
  const query: CatalogQuery = {
    buildingId: 'west-riverside',
    floorIds: [floorId],
  };
  const parameters = new URLSearchParams({
    buildingId: query.buildingId,
    floorIds: floorId,
  });
  const response = await fetch(`/api/v1/catalog?${parameters}`, signal ? { signal } : undefined);
  if (!response.ok) throw new Error(`Device catalog request failed: ${response.status}`);
  return CatalogResponseSchema.parse(await response.json());
};
