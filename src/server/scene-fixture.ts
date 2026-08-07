import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PreparedSceneSchema } from '../shared/scene-contracts.js';

const sceneFile = resolve(process.cwd(), 'data/generated/west-riverside-level-1.scene.json');

export const preparedScene = PreparedSceneSchema.parse(
  JSON.parse(readFileSync(sceneFile, 'utf8')),
);

export const { floor, features: sceneFeatures, source } = preparedScene;
