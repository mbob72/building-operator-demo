import { useQuery } from '@tanstack/react-query';
import { loadDeviceCatalog, loadStateSnapshot } from './operator-api';

const scopeKey = (floorIds?: string[]) => floorIds?.join(',') ?? 'building';

export const useDeviceCatalogQuery = (floorIds?: string[], enabled = true) => useQuery({
  queryKey: ['device-catalog', scopeKey(floorIds)],
  queryFn: ({ signal }) => loadDeviceCatalog(floorIds, signal),
  staleTime: 5 * 60_000,
  enabled,
});

export const useStateSnapshotQuery = (floorIds?: string[], enabled = true) => useQuery({
  queryKey: ['state-snapshot', scopeKey(floorIds)],
  queryFn: ({ signal }) => loadStateSnapshot(floorIds, signal),
  staleTime: 5 * 60_000,
  enabled,
});
