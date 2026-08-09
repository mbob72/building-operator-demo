import { afterEach, describe, expect, it } from 'vitest';
import {
  AcknowledgeAlarmResponseSchema,
  CatalogResponseSchema,
  CommandResponseSchema,
  CreateCommandResponseSchema,
  StateSnapshotSchema,
} from '../../src/shared/api-contracts';
import { deviceCatalog } from '../../src/server/device-catalog';
import { FloorSummarySchema, SceneResponseSchema } from '../../src/shared/scene-contracts';
import { buildApp } from '../../src/server/app';
import { RealtimeEngine } from '../../src/server/realtime-engine';

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
  it('lists all eight prepared floors in display order', async () => {
    const response = await createApp().inject({ method: 'GET', url: '/api/floors' });

    expect(response.statusCode).toBe(200);
    const floors = FloorSummarySchema.array().parse(response.json().floors);
    expect(floors).toHaveLength(8);
    expect(floors.map((floor) => floor.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(floors.at(-1)?.id).toBe('west-riverside-level-7');
    expect(floors.at(-2)?.id).toBe('west-riverside-level-7a');
  });

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

  it('returns full-range base geometry for every prepared floor', async () => {
    const app = createApp();
    const floorResponse = await app.inject({ method: 'GET', url: '/api/floors' });
    const preparedFloors = FloorSummarySchema.array().parse(floorResponse.json().floors);

    for (const floor of preparedFloors) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/scene/query',
        payload: {
          floorId: floor.id,
          viewport: { bbox: floor.bounds, width: 800, height: 600 },
          zoom: -8,
        },
      });
      const scene = SceneResponseSchema.parse(response.json());
      expect(scene.features.some((feature) => feature.kind === 'floor-shell')).toBe(true);
      expect(scene.meta.returnedFeatures).toBeGreaterThan(0);
      expect(scene.meta.emptyReason).toBeNull();
    }
  });

  it('returns an explicit empty reason outside floor bounds', async () => {
    const response = await createApp().inject({
      method: 'POST',
      url: '/api/scene/query',
      payload: {
        floorId: 'west-riverside-level-1',
        viewport: { bbox: [1_000, 1_000, 1_010, 1_010], width: 800, height: 600 },
        zoom: 2,
      },
    });
    const scene = SceneResponseSchema.parse(response.json());

    expect(scene.features).toEqual([]);
    expect(scene.meta.returnedFeatures).toBe(0);
    expect(scene.meta.emptyReason).toBe('viewport-outside-floor');
  });

  it('serves prepared geometry for a floor other than Level 1', async () => {
    const response = await createApp().inject({
      method: 'POST',
      url: '/api/scene/query',
      payload: {
        floorId: 'west-riverside-level-7a',
        viewport: { bbox: [0, 0, 100, 100], width: 800, height: 600 },
        zoom: 5,
      },
    });

    expect(response.statusCode).toBe(200);
    const scene = SceneResponseSchema.parse(response.json());
    expect(scene.floor.id).toBe('west-riverside-level-7a');
    expect(scene.sceneVersion).toBe('west-riverside-stage-2-v2:west-riverside-level-7a');
    expect(scene.features.length).toBeGreaterThan(0);
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

  it('combines repeated floor scopes without mixing status into metadata', async () => {
    const response = await createApp().inject({
      method: 'GET',
      url: '/api/v1/catalog?buildingId=west-riverside&floorIds=west-riverside-level-1&floorIds=west-riverside-level-7',
    });

    expect(response.statusCode).toBe(200);
    const catalog = CatalogResponseSchema.parse(response.json());
    expect(catalog.totalDevices).toBe(3_050);
    expect(new Set(catalog.devices.map((device) => device.floorId))).toEqual(new Set([
      'west-riverside-level-1',
      'west-riverside-level-7',
    ]));
    expect(catalog.devices.every((device) => !('status' in device))).toBe(true);
  });
});

describe('status snapshot API', () => {
  it('returns a deterministic status record for every scoped device', async () => {
    const app = createApp();
    const url = '/api/v1/state/snapshot?buildingId=west-riverside&floorIds=west-riverside-level-1';
    const response = await app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(200);
    const snapshot = StateSnapshotSchema.parse(response.json());
    expect(snapshot.telemetry).toHaveLength(2_900);
    expect(snapshot.sequence).toBe(0);
    expect(snapshot.telemetry.some((item) => item.status === 'warning')).toBe(true);
    expect(snapshot.telemetry.some((item) => item.status === 'critical')).toBe(true);
    expect(snapshot.alarms).toHaveLength(4);
    expect(new Set(snapshot.alarms.map((alarm) => alarm.severity)))
      .toEqual(new Set(['warning', 'critical']));
    expect(new Set(snapshot.alarms.map((alarm) => alarm.state)))
      .toEqual(new Set(['active', 'acknowledged', 'resolved']));
    expect(snapshot.alarms.every((alarm) => (
      snapshot.telemetry.some((telemetry) => telemetry.deviceId === alarm.deviceId)
    ))).toBe(true);
    expect(snapshot.telemetry.every((item) => (
      item.connection !== 'offline' || item.status === 'offline'
    ))).toBe(true);
    expect(response.headers.etag).toMatch(/^".+"$/);

    const repeated = StateSnapshotSchema.parse((await app.inject({ method: 'GET', url })).json());
    expect(repeated.streamId).toBe(snapshot.streamId);
    expect(repeated.sequence).toBe(snapshot.sequence);
    expect(repeated.telemetry).toEqual(snapshot.telemetry);

    const cached = await app.inject({
      method: 'GET',
      url,
      headers: { 'if-none-match': response.headers.etag },
    });
    expect(cached.statusCode).toBe(304);
  });

  it('returns the full 18,000-device building snapshot and validates scope errors', async () => {
    const app = createApp();
    const full = await app.inject({
      method: 'GET',
      url: '/api/v1/state/snapshot?buildingId=west-riverside',
    });
    const missing = await app.inject({
      method: 'GET',
      url: '/api/v1/state/snapshot?buildingId=west-riverside&floorIds=missing',
    });

    expect(full.statusCode).toBe(200);
    expect(StateSnapshotSchema.parse(full.json()).telemetry).toHaveLength(18_000);
    expect(missing.statusCode).toBe(404);
  });
});

describe('alarm API', () => {
  it('acknowledges an active alarm and returns the updated contract', async () => {
    const engine = new RealtimeEngine();
    const app = buildApp({ realtimeEngine: engine });
    apps.push(app);
    const initial = engine.snapshot(['west-riverside-level-1']).alarms
      .find((alarm) => alarm.state === 'active')!;

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/alarms/${initial.id}/acknowledge`,
      payload: {
        acknowledgedBy: 'demo-operator',
        acknowledgedAt: '2026-08-09T12:00:00.000Z',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(AcknowledgeAlarmResponseSchema.parse(response.json()).alarm).toMatchObject({
      id: initial.id,
      state: 'acknowledged',
      acknowledgedBy: 'demo-operator',
    });
    expect(engine.latestSequence).toBe(1);
  });

  it('rejects invalid, missing, and already resolved alarm acknowledgements', async () => {
    const engine = new RealtimeEngine();
    const app = buildApp({ realtimeEngine: engine });
    apps.push(app);
    const resolved = engine.snapshot(['west-riverside-level-1']).alarms
      .find((alarm) => alarm.state === 'resolved')!;

    const invalid = await app.inject({
      method: 'POST',
      url: `/api/v1/alarms/${resolved.id}/acknowledge`,
      payload: { acknowledgedBy: '' },
    });
    const missing = await app.inject({
      method: 'POST',
      url: '/api/v1/alarms/alarm-missing/acknowledge',
      payload: {
        acknowledgedBy: 'demo-operator',
        acknowledgedAt: '2026-08-09T12:00:00.000Z',
      },
    });
    const conflict = await app.inject({
      method: 'POST',
      url: `/api/v1/alarms/${resolved.id}/acknowledge`,
      payload: {
        acknowledgedBy: 'demo-operator',
        acknowledgedAt: '2026-08-09T12:00:00.000Z',
      },
    });

    expect(invalid.statusCode).toBe(400);
    expect(missing.statusCode).toBe(404);
    expect(conflict.statusCode).toBe(409);
  });
});

describe('command API', () => {
  it('creates an idempotent pending command and exposes lookup fallback', async () => {
    const engine = new RealtimeEngine();
    const app = buildApp({ realtimeEngine: engine });
    apps.push(app);
    const device = deviceCatalog.devices.find((item) => item.capabilities.commands.some(
      (capability) => capability.kind === 'setOnOff' && !capability.requiresConfirmation,
    ))!;
    const payload = {
      clientRequestId: 'api-command-request-1',
      deviceId: device.id,
      intent: { kind: 'setOnOff', value: false },
      requestedAt: '2026-08-09T12:00:00.000Z',
      requestedBy: 'demo-operator',
      confirmation: null,
    } as const;

    const response = await app.inject({ method: 'POST', url: '/api/v1/commands', payload });
    expect(response.statusCode).toBe(200);
    const command = CreateCommandResponseSchema.parse(response.json()).command;
    expect(command).toMatchObject({ state: 'pending', deviceId: device.id, intent: payload.intent });
    expect(engine.latestSequence).toBe(1);

    const repeated = await app.inject({ method: 'POST', url: '/api/v1/commands', payload });
    expect(repeated.statusCode).toBe(200);
    expect(CreateCommandResponseSchema.parse(repeated.json()).command.id).toBe(command.id);
    expect(engine.latestSequence).toBe(1);

    const lookup = await app.inject({ method: 'GET', url: `/api/v1/commands/${command.id}` });
    expect(lookup.statusCode).toBe(200);
    expect(CommandResponseSchema.parse(lookup.json()).command.id).toBe(command.id);
    expect((await app.inject({
      method: 'GET',
      url: '/api/v1/commands/command-missing',
    })).statusCode).toBe(404);
  });

  it('rejects invalid command bodies, capabilities, confirmation, and idempotency conflicts', async () => {
    const engine = new RealtimeEngine();
    const app = buildApp({ realtimeEngine: engine });
    apps.push(app);
    const criticalDevice = deviceCatalog.devices.find((item) => item.capabilities.commands.some(
      (capability) => capability.kind === 'setOnOff' && capability.requiresConfirmation,
    ))!;
    const request = {
      clientRequestId: 'api-critical-request',
      deviceId: criticalDevice.id,
      intent: { kind: 'setOnOff', value: true },
      requestedAt: '2026-08-09T12:00:00.000Z',
      requestedBy: 'demo-operator',
      confirmation: null,
    } as const;

    expect((await app.inject({
      method: 'POST', url: '/api/v1/commands', payload: { ...request, requestedBy: '' },
    })).statusCode).toBe(400);
    expect((await app.inject({
      method: 'POST', url: '/api/v1/commands', payload: request,
    })).statusCode).toBe(422);

    const confirmed = {
      ...request,
      confirmation: {
        confirmedAt: request.requestedAt,
        confirmedBy: request.requestedBy,
      },
    };
    expect((await app.inject({
      method: 'POST', url: '/api/v1/commands', payload: confirmed,
    })).statusCode).toBe(200);
    expect((await app.inject({
      method: 'POST',
      url: '/api/v1/commands',
      payload: { ...confirmed, intent: { kind: 'setOnOff', value: false } },
    })).statusCode).toBe(409);
  });
});
