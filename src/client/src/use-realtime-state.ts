import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { loadStateSnapshot, loadStateSnapshotPath } from './operator-api';
import { RealtimeClient } from './realtime-client';
import { operatorRealtimeStore } from './realtime-hot-store';

export const useRealtimeSelector = <T,>(
  selector: (snapshot: ReturnType<typeof operatorRealtimeStore.getSnapshot>) => T,
) => useSyncExternalStore(
  operatorRealtimeStore.subscribe,
  () => selector(operatorRealtimeStore.getSnapshot()),
  () => selector(operatorRealtimeStore.getSnapshot()),
);

export const useRealtimeBootstrap = (enabled = true) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const abortController = new AbortController();
    let client: RealtimeClient | undefined;
    let disposed = false;

    const start = async () => {
      operatorRealtimeStore.setConnection('connecting');
      try {
        if (!operatorRealtimeStore.getSnapshot().ready) {
          const snapshot = await loadStateSnapshot(undefined, abortController.signal);
          if (disposed) return;
          operatorRealtimeStore.replaceSnapshot(snapshot);
        }
        client = new RealtimeClient({
          store: operatorRealtimeStore,
          loadSnapshot: (path) => path
            ? loadStateSnapshotPath(path)
            : loadStateSnapshot(),
          onCatalogInvalidated: () => {
            void queryClient.invalidateQueries({ queryKey: ['device-catalog'] });
          },
        });
        client.start();
      } catch (error) {
        if (disposed || abortController.signal.aborted) return;
        operatorRealtimeStore.setConnection(
          'error',
          error instanceof Error ? error.message : 'Realtime bootstrap failed',
        );
      }
    };

    void start();
    return () => {
      disposed = true;
      abortController.abort();
      client?.stop();
    };
  }, [enabled, queryClient]);
};

export const useDeviceTelemetry = (deviceId: string) => useRealtimeSelector(
  (snapshot) => snapshot.telemetryByDeviceId.get(deviceId),
);
