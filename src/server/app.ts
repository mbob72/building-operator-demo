import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { SceneQuerySchema, type BBox, type SceneFeature } from '../shared/scene-contracts.js';
import { floor, sceneFeatures, source } from './scene-fixture.js';

interface AppOptions {
  serveStatic?: boolean;
  staticRoot?: string;
}

const intersects = (a: BBox, b: BBox) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

const isVisibleAtZoom = (feature: SceneFeature, zoom: number) =>
  feature.minZoom <= zoom && feature.maxZoom >= zoom;

const zoomBand = (zoom: number) => {
  if (zoom < 1.7) return 'overview' as const;
  if (zoom < 4.1) return 'standard' as const;
  return 'detail' as const;
};

export const buildApp = (options: AppOptions = {}) => {
  const app = Fastify({ logger: false });

  app.get('/api/health', async () => ({ status: 'ok' }));

  app.get('/api/floors', async () => ({ floors: [floor] }));

  app.post('/api/scene/query', async (request, reply) => {
    const parsed = SceneQuerySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_scene_query',
        details: parsed.error.issues,
      });
    }

    if (parsed.data.floorId !== floor.id) {
      return reply.status(404).send({ error: 'floor_not_found' });
    }

    const features = sceneFeatures.filter(
      (feature) => intersects(feature.bbox, parsed.data.viewport.bbox)
        && isVisibleAtZoom(feature, parsed.data.zoom),
    );

    return {
      sceneVersion: 'west-riverside-level-1-v1',
      source,
      floor,
      request: parsed.data,
      zoomBand: zoomBand(parsed.data.zoom),
      features,
      meta: {
        totalFeatures: sceneFeatures.length,
        returnedFeatures: features.length,
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
