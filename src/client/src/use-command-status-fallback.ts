import { useEffect } from 'react';
import { loadCommand } from './operator-api';
import { operatorRealtimeStore } from './realtime-hot-store';
import { useRealtimeSelector } from './use-realtime-state';

export const COMMAND_STATUS_POLL_INTERVAL_MS = 500;

const isTerminal = (state: string) => (
  state === 'executed' || state === 'failed' || state === 'timedOut'
);

export const useCommandStatusFallback = () => {
  const connectionStatus = useRealtimeSelector((snapshot) => snapshot.connectionStatus);
  const pendingFingerprint = useRealtimeSelector((snapshot) => [...snapshot.commandsById.values()]
    .filter((command) => !isTerminal(command.state))
    .map((command) => `${command.id}:${command.state}`)
    .sort()
    .join('|'));

  useEffect(() => {
    if (connectionStatus === 'live' || !pendingFingerprint) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      const commandIds = [...operatorRealtimeStore.getSnapshot().commandsById.values()]
        .filter((command) => !isTerminal(command.state))
        .map((command) => command.id);
      await Promise.all(commandIds.map(async (commandId) => {
        try {
          operatorRealtimeStore.upsertCommand(await loadCommand(commandId));
        } catch {
          // The realtime connection status already exposes degraded transport state.
        }
      }));
      if (cancelled || operatorRealtimeStore.getSnapshot().connectionStatus === 'live') return;
      if ([...operatorRealtimeStore.getSnapshot().commandsById.values()]
        .some((command) => !isTerminal(command.state))) {
        timer = setTimeout(() => void poll(), COMMAND_STATUS_POLL_INTERVAL_MS);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [connectionStatus, pendingFingerprint]);
};
