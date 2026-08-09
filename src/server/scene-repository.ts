import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  PreparedSceneSchema,
  type FloorSummary,
  type PreparedScene,
} from '../shared/scene-contracts.js';

const FloorIndexSchema = z.object({
  datasetVersion: z.string().min(1),
  floors: z.array(z.object({
    id: z.string().min(1),
    order: z.number().int().positive(),
    sceneFile: z.string().min(1),
  }).passthrough()).min(1),
}).passthrough();

const generatedDirectory = resolve(process.cwd(), 'data/generated');
const floorIndex = FloorIndexSchema.parse(JSON.parse(readFileSync(
  resolve(generatedDirectory, 'west-riverside.floor-index.json'),
  'utf8',
)));

interface SceneRecord {
  scene: PreparedScene;
  floor: FloorSummary;
}

const records = floorIndex.floors
  .sort((left, right) => left.order - right.order)
  .map((entry): SceneRecord => {
    const scene = PreparedSceneSchema.parse(JSON.parse(readFileSync(
      resolve(generatedDirectory, entry.sceneFile),
      'utf8',
    )));
    if (scene.floor.id !== entry.id) {
      throw new Error(`Floor index mismatch: ${entry.id} != ${scene.floor.id}`);
    }
    return {
      scene,
      floor: { ...scene.floor, order: entry.order },
    };
  });

const recordByFloorId = new Map(records.map((record) => [record.floor.id, record]));

export const sceneDatasetVersion = floorIndex.datasetVersion;
export const floors = records.map((record) => record.floor);

export const findScene = (floorId: string): SceneRecord | undefined => recordByFloorId.get(floorId);
