import Fastify from 'fastify';
import fastifyCompress from '@fastify/compress';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import {
  AcknowledgeAlarmRequestSchema,
  AcknowledgeAlarmResponseSchema,
  CatalogQuerySchema,
  CommandResponseSchema,
  CreateCommandRequestSchema,
  CreateCommandResponseSchema,
  StateSnapshotQuerySchema,
} from '../shared/api-contracts.js';
import { SceneQuerySchema } from '../shared/scene-contracts.js';
import { deviceCatalog, selectCatalogFloors } from './device-catalog.js';
import { findScene, floors, sceneDatasetVersion } from './scene-repository.js';
import { RealtimeEngine } from './realtime-engine.js';
import { registerRealtimeRoute } from './realtime-route.js';
import { selectSceneFeatures } from './scene-selection.js';

interface AppOptions {
  serveStatic?: boolean;
  staticRoot?: string;
  realtimeEngine?: RealtimeEngine;
  startRealtimeSimulator?: boolean;
}

const zoomBand = (zoom: number) => {
  if (zoom < 1.7) return 'overview' as const;
  if (zoom < 4.1) return 'standard' as const;
  return 'detail' as const;
};

export const buildApp = (options: AppOptions = {}) => {
  const app = Fastify({ logger: false });
  const realtimeEngine = options.realtimeEngine ?? new RealtimeEngine();
  app.register(fastifyWebsocket, { options: { maxPayload: 1_048_576 } });
  app.register(fastifyCompress, { global: true, threshold: 1_024 });
  app.register(async (realtimeRoutes) => {
    registerRealtimeRoute(realtimeRoutes, realtimeEngine);
  });

  if (options.startRealtimeSimulator) {
    app.addHook('onReady', () => realtimeEngine.startSimulator());
  }
  app.addHook('onClose', () => realtimeEngine.stopSimulator());

  app.get('/api/health', async () => ({ status: 'ok' }));

  app.get('/api/floors', async () => ({ floors }));

  app.get('/api/v1/catalog', async (request, reply) => {
    const raw = request.query as { buildingId?: unknown; floorIds?: unknown };
    const parsed = CatalogQuerySchema.safeParse({
      buildingId: raw.buildingId,
      floorIds: typeof raw.floorIds === 'string' ? [raw.floorIds] : raw.floorIds,
    });
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_catalog_query',
        details: parsed.error.issues,
      });
    }
    if (parsed.data.buildingId !== deviceCatalog.building.id) {
      return reply.status(404).send({ error: 'building_not_found' });
    }

    const floorIds = parsed.data.floorIds ?? deviceCatalog.floors.map((item) => item.id);
    if (floorIds.some((floorId) => !deviceCatalog.floors.some((item) => item.id === floorId))) {
      return reply.status(404).send({ error: 'floor_not_found' });
    }
    const etag = `"${createHash('sha256')
      .update(`${deviceCatalog.catalogVersion}:${floorIds.join(',')}`)
      .digest('base64url')}"`;
    reply.header('etag', etag);
    reply.header('cache-control', 'public, max-age=300, stale-while-revalidate=60');
    if (request.headers['if-none-match'] === etag) return reply.status(304).send();
    return selectCatalogFloors(floorIds);
  });

  app.get('/api/v1/state/snapshot', async (request, reply) => {
    const raw = request.query as { buildingId?: unknown; floorIds?: unknown };
    const parsed = StateSnapshotQuerySchema.safeParse({
      buildingId: raw.buildingId,
      floorIds: typeof raw.floorIds === 'string' ? [raw.floorIds] : raw.floorIds,
    });
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_snapshot_query',
        details: parsed.error.issues,
      });
    }
    if (parsed.data.buildingId !== deviceCatalog.building.id) {
      return reply.status(404).send({ error: 'building_not_found' });
    }
    const floorIds = parsed.data.floorIds ?? floors.map((item) => item.id);
    if (floorIds.some((floorId) => !floors.some((item) => item.id === floorId))) {
      return reply.status(404).send({ error: 'floor_not_found' });
    }
    const snapshot = realtimeEngine.snapshot(floorIds);
    const etag = `"${createHash('sha256')
      .update(`${snapshot.streamId}:${snapshot.sequence}:${floorIds.join(',')}`)
      .digest('base64url')}"`;
    reply.header('etag', etag);
    reply.header('cache-control', 'no-store');
    if (request.headers['if-none-match'] === etag) return reply.status(304).send();
    return snapshot;
  });

  app.post('/api/v1/alarms/:alarmId/acknowledge', async (request, reply) => {
    const { alarmId } = request.params as { alarmId?: string };
    const parsed = AcknowledgeAlarmRequestSchema.safeParse(request.body);
    if (!alarmId || !parsed.success) {
      return reply.status(400).send({
        error: 'invalid_acknowledge_request',
        ...(!parsed.success ? { details: parsed.error.issues } : {}),
      });
    }

    const result = realtimeEngine.acknowledgeAlarm(alarmId, parsed.data);
    if (result.status === 'not-found') {
      return reply.status(404).send({ error: 'alarm_not_found' });
    }
    if (result.status === 'resolved') {
      return reply.status(409).send({
        error: 'alarm_already_resolved',
        alarm: result.alarm,
      });
    }

    reply.header('cache-control', 'no-store');
    return AcknowledgeAlarmResponseSchema.parse({ alarm: result.alarm });
  });

  app.post('/api/v1/commands', async (request, reply) => {
    const parsed = CreateCommandRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_command_request',
        details: parsed.error.issues,
      });
    }
    const result = realtimeEngine.createCommand(parsed.data);
    if (result.status === 'device-not-found') {
      return reply.status(404).send({ error: 'command_device_not_found' });
    }
    if (result.status === 'idempotency-conflict') {
      return reply.status(409).send({
        error: 'command_idempotency_conflict',
        command: result.command,
      });
    }
    if (result.status !== 'created') {
      return reply.status(422).send({
        error: result.status,
        ...('capability' in result ? { capability: result.capability } : {}),
      });
    }
    reply.header('cache-control', 'no-store');
    return CreateCommandResponseSchema.parse({ command: result.command });
  });

  app.get('/api/v1/commands/:commandId', async (request, reply) => {
    const { commandId } = request.params as { commandId?: string };
    if (!commandId) return reply.status(400).send({ error: 'invalid_command_id' });
    const command = realtimeEngine.getCommand(commandId);
    if (!command) return reply.status(404).send({ error: 'command_not_found' });
    reply.header('cache-control', 'no-store');
    return CommandResponseSchema.parse({ command });
  });

  app.post('/api/scene/query', async (request, reply) => {
    const parsed = SceneQuerySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_scene_query',
        details: parsed.error.issues,
      });
    }

    const record = findScene(parsed.data.floorId);
    if (!record) {
      return reply.status(404).send({ error: 'floor_not_found' });
    }

    const selection = selectSceneFeatures(
      record.scene.features,
      record.floor.bounds,
      parsed.data.viewport.bbox,
      parsed.data.zoom,
    );

    return {
      sceneVersion: `${sceneDatasetVersion}:${record.floor.id}`,
      source: record.scene.source,
      floor: record.floor,
      request: parsed.data,
      zoomBand: zoomBand(parsed.data.zoom),
      features: selection.features,
      meta: {
        totalFeatures: record.scene.features.length,
        returnedFeatures: selection.features.length,
        emptyReason: selection.emptyReason,
      },
    };
  });

  if (options.serveStatic) {
    const staticRoot = options.staticRoot ?? resolve(process.cwd(), 'dist/web');
    app.register(fastifyStatic, {
      root: staticRoot,
      prefix: '/',
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('index.html', { maxAge: 0, immutable: false });
      }
      return reply.status(404).send({ error: 'not_found' });
    });
  }

  return app;
};
