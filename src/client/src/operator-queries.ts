import { useQuery } from '@tanstack/react-query';
import { loadDeviceCatalog } from './operator-api';

const scopeKey = (floorIds?: string[]) => floorIds?.join(',') ?? 'building';

export const useDeviceCatalogQuery = (floorIds?: string[], enabled = true) => useQuery({
  queryKey: ['device-catalog', scopeKey(floorIds)],
  queryFn: ({ signal }) => loadDeviceCatalog(floorIds, signal),
  staleTime: 5 * 60_000,
  enabled,
});
