import { readFileSync } from 'node:fs';
import { PreparedSceneSchema } from '../shared/scene-contracts.js';

const sceneFile = new URL('../../data/generated/west-riverside-level-1.scene.json', import.meta.url);

export const preparedScene = PreparedSceneSchema.parse(
  JSON.parse(readFileSync(sceneFile, 'utf8')),
);

export const { floor, features: sceneFeatures, source } = preparedScene;
