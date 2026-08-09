import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { PreparedSceneSchema } from '../../src/shared/scene-contracts.js';
import { SCENE_MAX_ZOOM, SCENE_MIN_ZOOM } from '../../src/shared/scene-contracts.js';

const FloorIndexSchema = z.object({
  datasetVersion: z.string().min(1),
  generatedAt: z.string().datetime({ offset: true }),
  building: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    timezone: z.string().min(1),
  }).strict(),
  source: z.object({
    file: z.string().min(1),
    sha256: z.string().length(64),
    license: z.string().min(1),
  }).strict(),
  floors: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    storey: z.string().min(1),
    elevation: z.number().finite(),
    bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    worldOrigin: z.tuple([z.number(), z.number()]),
    featureCount: z.number().int().positive(),
    byKind: z.record(z.string(), z.number().int().nonnegative()),
    byZoomBand: z.object({
      overview: z.number().int().nonnegative(),
      standard: z.number().int().nonnegative(),
      detail: z.number().int().nonnegative(),
    }).strict(),
    extractionMode: z.enum(['horizontal-section', 'horizontal-projection']),
    order: z.number().int().positive(),
    sceneFile: z.string().endsWith('.scene.json'),
  }).strict()).length(8),
}).strict();

const generatedDirectory = resolve(process.cwd(), 'data/generated');
const index = FloorIndexSchema.parse(JSON.parse(readFileSync(
  resolve(generatedDirectory, 'west-riverside.floor-index.json'),
  'utf8',
)));

const ids = new Set<string>();
let totalFeatures = 0;
for (const floor of index.floors) {
  if (ids.has(floor.id)) throw new Error(`Duplicate floor ID: ${floor.id}`);
  ids.add(floor.id);

  const scene = PreparedSceneSchema.parse(JSON.parse(readFileSync(
    resolve(generatedDirectory, floor.sceneFile),
    'utf8',
  )));
  if (scene.floor.id !== floor.id) throw new Error(`Scene ID mismatch for ${floor.id}`);
  if (JSON.stringify(scene.floor.bounds) !== JSON.stringify(floor.bounds)) {
    throw new Error(`Bounds mismatch for ${floor.id}`);
  }
  if (scene.features.length !== floor.featureCount
    || scene.stats.featureCount !== floor.featureCount) {
    throw new Error(`Feature count mismatch for ${floor.id}`);
  }
  const baseShells = scene.features.filter((feature) => (
    feature.kind === 'floor-shell'
    && feature.geometryType === 'polygon'
    && feature.minZoom <= SCENE_MIN_ZOOM
    && feature.maxZoom >= SCENE_MAX_ZOOM
  ));
  if (baseShells.length !== 1) {
    throw new Error(`Expected exactly one full-range floor-shell for ${floor.id}`);
  }
  const byZoomBand = {
    overview: scene.features.filter((feature) => feature.minZoom <= 1 && feature.maxZoom >= 1).length,
    standard: scene.features.filter((feature) => feature.minZoom <= 3 && feature.maxZoom >= 3).length,
    detail: scene.features.filter((feature) => feature.minZoom <= 5 && feature.maxZoom >= 5).length,
  };
  if (JSON.stringify(byZoomBand) !== JSON.stringify(floor.byZoomBand)) {
    throw new Error(`LOD count mismatch for ${floor.id}`);
  }
  if (Object.values(byZoomBand).some((count) => count === 0)) {
    throw new Error(`Every LOD band must contain base geometry for ${floor.id}`);
  }
  totalFeatures += floor.featureCount;
}

const rooftop = index.floors.find((floor) => floor.id === 'west-riverside-level-7a');
if (rooftop?.extractionMode !== 'horizontal-projection') {
  throw new Error('Level 7A must preserve its documented projection fallback');
}

console.log(JSON.stringify({
  datasetVersion: index.datasetVersion,
  floors: index.floors.length,
  totalFeatures,
  status: 'valid',
}, null, 2));
