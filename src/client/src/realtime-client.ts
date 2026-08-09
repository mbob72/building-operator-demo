import type { StateSnapshot } from '../../shared/api-contracts';
import {
  ServerRealtimeMessageSchema,
  type ClientRealtimeMessage,
} from '../../shared/realtime-contracts';
import {
  type RealtimeHotStore,
} from './realtime-hot-store';

interface SocketLike {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
  onopen: ((event: Event) => unknown) | null;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onclose: ((event: CloseEvent) => unknown) | null;
  onerror: ((event: Event) => unknown) | null;
}

interface RealtimeClientOptions {
  store: RealtimeHotStore;
  loadSnapshot: (path?: string) => Promise<StateSnapshot>;
  createSocket?: (url: string) => SocketLike;
  realtimeUrl?: string;
  now?: () => Date;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancelSchedule?: (timer: ReturnType<typeof setTimeout>) => void;
  onCatalogInvalidated?: () => void;
}

const defaultRealtimeUrl = () => {
  const url = new URL('/api/v1/realtime', window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
};

export class RealtimeClient {
  private readonly store: RealtimeHotStore;
  private readonly loadSnapshot: (path?: string) => Promise<StateSnapshot>;
  private readonly createSocket: (url: string) => SocketLike;
  private readonly realtimeUrl: string;
  private readonly now: () => Date;
  private readonly schedule: NonNullable<RealtimeClientOptions['schedule']>;
  private readonly cancelSchedule: NonNullable<RealtimeClientOptions['cancelSchedule']>;
  private readonly onCatalogInvalidated: () => void;
  private socket: SocketLike | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempt = 0;
  private stopped = true;
  private resyncing = false;

  constructor(options: RealtimeClientOptions) {
    this.store = options.store;
    this.loadSnapshot = options.loadSnapshot;
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url));
    this.realtimeUrl = options.realtimeUrl ?? defaultRealtimeUrl();
    this.now = options.now ?? (() => new Date());
    this.schedule = options.schedule ?? ((callback, delay) => setTimeout(callback, delay));
    this.cancelSchedule = options.cancelSchedule ?? ((timer) => clearTimeout(timer));
    this.onCatalogInvalidated = options.onCatalogInvalidated ?? (() => undefined);
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) this.cancelSchedule(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
    this.store.setConnection('idle');
  }

  private send(message: ClientRealtimeMessage) {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(message));
  }

  private resume() {
    const snapshot = this.store.getSnapshot();
    if (!snapshot.streamId) {
      this.send({
        type: 'subscribe',
        protocolVersion: '1',
        buildingId: 'west-riverside',
      });
      return;
    }
    this.send({
      type: 'resume',
      protocolVersion: '1',
      buildingId: 'west-riverside',
      streamId: snapshot.streamId,
      afterSequence: snapshot.sequence,
    });
  }

  private connect() {
    if (this.stopped) return;
    this.store.setConnection(this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting');
    const socket = this.createSocket(this.realtimeUrl);
    this.socket = socket;
    socket.onopen = () => {
      if (socket !== this.socket || this.stopped) return;
      this.reconnectAttempt = 0;
      this.resume();
    };
    socket.onmessage = (event) => {
      if (socket !== this.socket || this.stopped) return;
      let raw: unknown;
      try {
        raw = JSON.parse(event.data);
      } catch {
        this.store.setConnection('error', 'Invalid realtime server message');
        socket.close();
        return;
      }
      const parsed = ServerRealtimeMessageSchema.safeParse(raw);
      if (!parsed.success) {
        this.store.setConnection('error', 'Invalid realtime server message');
        socket.close();
        return;
      }
      const message = parsed.data;
      if (message.type === 'hello') {
        const state = this.store.getSnapshot();
        if (state.streamId === message.streamId && state.sequence <= message.latestSequence) {
          this.store.setConnection('live');
        }
      } else if (message.type === 'event.batch') {
        const result = this.store.applyBatch(message);
        if (result === 'gap' || result === 'stream-mismatch' || result === 'invalid-state') {
          void this.resync();
          return;
        }
        if (message.events.some((item) => item.event.type === 'catalog.invalidated')) {
          this.onCatalogInvalidated();
        }
      } else if (message.type === 'resync.required') {
        void this.resync(message.snapshotPath);
      } else if (!this.store.markHeartbeat(
        message.streamId,
        message.latestSequence,
        this.now().toISOString(),
      )) {
        this.resume();
      }
    };
    socket.onerror = () => {
      if (socket === this.socket && !this.stopped) {
        this.store.setConnection('error', 'Realtime connection error');
      }
    };
    socket.onclose = () => {
      if (socket !== this.socket || this.stopped) return;
      this.socket = undefined;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    this.reconnectAttempt += 1;
    this.store.setConnection('reconnecting');
    const delay = Math.min(250 * 2 ** (this.reconnectAttempt - 1), 5_000);
    this.reconnectTimer = this.schedule(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
  }

  private async resync(path?: string) {
    if (this.resyncing || this.stopped) return;
    this.resyncing = true;
    this.store.setConnection('resyncing');
    try {
      const snapshot = await this.loadSnapshot(path);
      if (this.stopped) return;
      this.store.replaceSnapshot(snapshot);
      this.resume();
    } catch (error) {
      if (!this.stopped) {
        this.store.setConnection(
          'error',
          error instanceof Error ? error.message : 'Realtime resync failed',
        );
        this.socket?.close();
      }
    } finally {
      this.resyncing = false;
    }
  }
}
