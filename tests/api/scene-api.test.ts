import { afterEach, describe, expect, it } from 'vitest';
import { CatalogResponseSchema } from '../../src/shared/api-contracts';
import { SceneResponseSchema } from '../../src/shared/scene-contracts';
import { buildApp } from '../../src/server/app';

const apps: ReturnType<typeof buildApp>[] = [];
const createApp = () => {
  const app = buildApp();
  apps.push(app);
  return app;
};

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('scene API', () => {
  it('returns a contract-valid floor scene', async () => {
    const response = await createApp().inject({
      method: 'POST',
      url: '/api/scene/query',
      payload: {
        floorId: 'west-riverside-level-1',
        viewport: { bbox: [0, 0, 104, 98], width: 1_200, height: 800 },
        zoom: 5,
      },
    });

    expect(response.statusCode).toBe(200);
    const scene = SceneResponseSchema.parse(response.json());
    expect(scene.floor.id).toBe('west-riverside-level-1');
    expect(scene.source.project).toBe('West Riverside Hospital');
    expect(scene.source.license).toBe('CC BY 3.0');
    expect(scene.meta.totalFeatures).toBeGreaterThan(1_000);
    expect(scene.zoomBand).toBe('detail');
    expect(scene.meta.returnedFeatures).toBe(scene.features.length);
    expect(scene.features.some((feature) => feature.kind === 'door')).toBe(true);
  });

  it('filters features outside the requested viewport', async () => {
    const response = await createApp().inject({
      method: 'POST',
      url: '/api/scene/query',
      payload: {
        floorId: 'west-riverside-level-1',
        viewport: { bbox: [0, 0, 20, 20], width: 800, height: 600 },
        zoom: 5,
      },
    });
    const scene = SceneResponseSchema.parse(response.json());

    expect(scene.meta.returnedFeatures).toBeLessThan(scene.meta.totalFeatures);
    expect(scene.features.every((feature) => (
      feature.bbox[0] <= 20 && feature.bbox[2] >= 0
      && feature.bbox[1] <= 20 && feature.bbox[3] >= 0
    ))).toBe(true);
  });

  it('returns more detail at high zoom', async () => {
    const app = createApp();
    const payload = {
      floorId: 'west-riverside-level-1',
      viewport: { bbox: [0, 0, 104, 98], width: 1_200, height: 800 },
    };
    const overview = await app.inject({ method: 'POST', url: '/api/scene/query', payload: { ...payload, zoom: 2 } });
    const detail = await app.inject({ method: 'POST', url: '/api/scene/query', payload: { ...payload, zoom: 5 } });

    expect(detail.json().meta.returnedFeatures).toBeGreaterThan(overview.json().meta.returnedFeatures);
  });

  it('rejects invalid queries and unknown floors', async () => {
    const app = createApp();
    const invalid = await app.inject({ method: 'POST', url: '/api/scene/query', payload: { floorId: '' } });
    const missing = await app.inject({
      method: 'POST',
      url: '/api/scene/query',
      payload: {
        floorId: 'missing',
        viewport: { bbox: [0, 0, 100, 100], width: 100, height: 100 },
        zoom: 0,
      },
    });

    expect(invalid.statusCode).toBe(400);
    expect(missing.statusCode).toBe(404);
  });
});

describe('device catalog API', () => {
  it('returns stable metadata for only the requested floor', async () => {
    const response = await createApp().inject({
      method: 'GET',
      url: '/api/v1/catalog?buildingId=west-riverside&floorIds=west-riverside-level-1',
    });

    expect(response.statusCode).toBe(200);
    const catalog = CatalogResponseSchema.parse(response.json());
    expect(catalog.floors.map((floor) => floor.id)).toEqual(['west-riverside-level-1']);
    expect(catalog.totalDevices).toBe(2_900);
    expect(catalog.devices).toHaveLength(2_900);
    expect(catalog.devices.every((device) => device.floorId === 'west-riverside-level-1')).toBe(true);
    expect(catalog.devices.some((device) => device.dataOrigin === 'ifc')).toBe(true);
    expect(catalog.devices.some((device) => device.dataOrigin === 'synthetic')).toBe(true);
    expect(catalog.devices.every((device) => !('status' in device))).toBe(true);
    expect(response.headers.etag).toMatch(/^".+"$/);

    const cached = await createApp().inject({
      method: 'GET',
      url: '/api/v1/catalog?buildingId=west-riverside&floorIds=west-riverside-level-1',
      headers: { 'if-none-match': response.headers.etag },
    });
    expect(cached.statusCode).toBe(304);
  });

  it('rejects invalid catalog queries and unknown floors', async () => {
    const app = createApp();
    const invalid = await app.inject({ method: 'GET', url: '/api/v1/catalog?buildingId=' });
    const missing = await app.inject({
      method: 'GET',
      url: '/api/v1/catalog?buildingId=west-riverside&floorIds=missing',
    });

    expect(invalid.statusCode).toBe(400);
    expect(missing.statusCode).toBe(404);
  });
});
