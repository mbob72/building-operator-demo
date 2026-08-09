import { afterEach, describe, expect, it } from 'vitest';
import type { RawData, WebSocket } from 'ws';
import { ServerRealtimeMessageSchema } from '../../src/shared/realtime-contracts';
import { buildApp } from '../../src/server/app';
import { RealtimeEngine } from '../../src/server/realtime-engine';
import { initialTelemetry } from '../../src/server/state-snapshot';

const apps: ReturnType<typeof buildApp>[] = [];
const now = () => new Date('2026-08-09T12:00:00.000Z');

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const openSocket = async (engine: RealtimeEngine) => {
  const app = buildApp({ realtimeEngine: engine });
  apps.push(app);
  await app.ready();
  return app.injectWS('/api/v1/realtime');
};

const nextMessage = (socket: WebSocket) => new Promise<ReturnType<typeof ServerRealtimeMessageSchema.parse>>(
  (resolve, reject) => {
    socket.once('message', (raw) => {
      try {
        resolve(ServerRealtimeMessageSchema.parse(JSON.parse(raw.toString())));
      } catch (error) {
        reject(error);
      }
    });
  },
);

const nextMessages = (socket: WebSocket, count: number) => new Promise<
ReturnType<typeof ServerRealtimeMessageSchema.parse>[]
>((resolve, reject) => {
  const messages: ReturnType<typeof ServerRealtimeMessageSchema.parse>[] = [];
  const receive = (raw: RawData) => {
    try {
      messages.push(ServerRealtimeMessageSchema.parse(JSON.parse(raw.toString())));
      if (messages.length === count) {
        socket.off('message', receive);
        resolve(messages);
      }
    } catch (error) {
      socket.off('message', receive);
      reject(error);
    }
  };
  socket.on('message', receive);
});

describe('realtime WebSocket endpoint', () => {
  it('resumes the current stream and delivers a live event batch', async () => {
    const engine = new RealtimeEngine({ streamId: 'stream-test', now });
    const socket = await openSocket(engine);
    const helloPromise = nextMessage(socket);
    socket.send(JSON.stringify({
      type: 'resume',
      protocolVersion: '1',
      buildingId: 'west-riverside',
      streamId: engine.streamId,
      afterSequence: 0,
    }));

    expect(await helloPromise).toMatchObject({ type: 'hello', streamId: engine.streamId });
    const batchPromise = nextMessage(socket);
    const current = initialTelemetry[0]!;
    engine.publishTelemetryPatches([{
      deviceId: current.deviceId,
      revision: current.revision + 1,
      observedAt: now().toISOString(),
      receivedAt: now().toISOString(),
      values: { live: true },
    }]);

    expect(await batchPromise).toMatchObject({
      type: 'event.batch',
      fromSequence: 1,
      toSequence: 1,
    });
    socket.close();
  });

  it('requires snapshot resync when the stream identity changed', async () => {
    const engine = new RealtimeEngine({ streamId: 'stream-current', now });
    const socket = await openSocket(engine);
    const messagesPromise = nextMessages(socket, 2);
    socket.send(JSON.stringify({
      type: 'resume',
      protocolVersion: '1',
      buildingId: 'west-riverside',
      streamId: 'stream-before-restart',
      afterSequence: 20,
    }));

    const [hello, resync] = await messagesPromise;
    expect(hello?.type).toBe('hello');
    expect(resync).toMatchObject({
      type: 'resync.required',
      streamId: engine.streamId,
      reason: 'streamChanged',
    });
    socket.close();
  });

  it('reports an expired replay cursor', async () => {
    const engine = new RealtimeEngine({ streamId: 'stream-test', replayLimit: 1, now });
    const current = initialTelemetry[0]!;
    for (let revision = 2; revision <= 3; revision += 1) {
      engine.publishTelemetryPatches([{
        deviceId: current.deviceId,
        revision,
        observedAt: now().toISOString(),
        receivedAt: now().toISOString(),
        values: { revision },
      }]);
    }
    const socket = await openSocket(engine);
    const messagesPromise = nextMessages(socket, 2);
    socket.send(JSON.stringify({
      type: 'resume',
      protocolVersion: '1',
      buildingId: 'west-riverside',
      streamId: engine.streamId,
      afterSequence: 0,
    }));

    const [hello, resync] = await messagesPromise;
    expect(hello?.type).toBe('hello');
    expect(resync).toMatchObject({ type: 'resync.required', reason: 'cursorExpired' });
    socket.close();
  });
});
