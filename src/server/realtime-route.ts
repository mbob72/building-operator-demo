import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import {
  ClientRealtimeMessageSchema,
  EventBatchMessageSchema,
  type ServerRealtimeMessage,
} from '../shared/realtime-contracts.js';
import { deviceCatalog } from './device-catalog.js';
import {
  REALTIME_HEARTBEAT_INTERVAL_MS,
  type RealtimeEngine,
} from './realtime-engine.js';

const SNAPSHOT_PATH = '/api/v1/state/snapshot?buildingId=west-riverside';

const sendMessage = (socket: WebSocket, message: ServerRealtimeMessage) => {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
};

const hasValidScope = (buildingId: string, floorIds: string[] | undefined) => (
  buildingId === deviceCatalog.building.id
  && (floorIds ?? []).every((floorId) => (
    deviceCatalog.floors.some((floor) => floor.id === floorId)
  ))
);

export const registerRealtimeRoute = (
  app: FastifyInstance,
  engine: RealtimeEngine,
) => {
  app.get('/api/v1/realtime', { websocket: true }, (socket) => {
    const connectionId = `connection-${randomUUID()}`;
    let unsubscribe: (() => boolean) | undefined;

    const sendHello = () => sendMessage(socket, {
      type: 'hello',
      protocolVersion: '1',
      connectionId,
      streamId: engine.streamId,
      latestSequence: engine.latestSequence,
      retentionStartSequence: engine.retentionStartSequence,
      heartbeatIntervalMs: REALTIME_HEARTBEAT_INTERVAL_MS,
    });

    const sendResync = (reason: 'cursorExpired' | 'streamChanged' | 'serverRestart') => {
      sendMessage(socket, {
        type: 'resync.required',
        streamId: engine.streamId,
        latestSequence: engine.latestSequence,
        reason,
        snapshotPath: SNAPSHOT_PATH,
      });
    };

    const heartbeatTimer = setInterval(() => sendMessage(socket, {
      type: 'heartbeat',
      streamId: engine.streamId,
      latestSequence: engine.latestSequence,
      sentAt: new Date().toISOString(),
    }), REALTIME_HEARTBEAT_INTERVAL_MS);
    heartbeatTimer.unref?.();

    socket.on('message', (rawMessage) => {
      let raw: unknown;
      try {
        raw = JSON.parse(rawMessage.toString());
      } catch {
        socket.close(1008, 'invalid JSON');
        return;
      }
      const parsed = ClientRealtimeMessageSchema.safeParse(raw);
      if (!parsed.success || !hasValidScope(parsed.data.buildingId, parsed.data.floorIds)) {
        socket.close(1008, 'invalid realtime message');
        return;
      }

      sendHello();
      if (parsed.data.type === 'subscribe') return;

      unsubscribe?.();
      unsubscribe = undefined;
      if (parsed.data.streamId !== engine.streamId) {
        sendResync('streamChanged');
        return;
      }
      if (parsed.data.afterSequence > engine.latestSequence) {
        sendResync('serverRestart');
        return;
      }
      const replay = engine.replayAfter(parsed.data.afterSequence);
      if (!replay) {
        sendResync('cursorExpired');
        return;
      }
      if (replay.length > 0) {
        sendMessage(socket, EventBatchMessageSchema.parse({
          type: 'event.batch',
          streamId: engine.streamId,
          emittedAt: new Date().toISOString(),
          fromSequence: replay[0]!.sequence,
          toSequence: replay.at(-1)!.sequence,
          events: replay,
        }));
      }
      unsubscribe = engine.subscribe((batch) => sendMessage(socket, batch));
    });

    socket.on('close', () => {
      clearInterval(heartbeatTimer);
      unsubscribe?.();
    });
  });
};
