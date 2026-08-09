import { describe, expect, it } from 'vitest';
import { PreparedSceneSchema } from '../../src/shared/scene-contracts';

const preparedScene = {
  source: {
    project: 'Test building',
    discipline: 'Architecture',
    file: 'test.ifc',
    schema: 'IFC2X3',
    license: 'test',
    storey: 'Level 1',
    sectionHeightMeters: 1.2,
    extractionMode: 'horizontal-section',
  },
  floor: {
    id: 'floor-1',
    name: 'Floor 1',
    elevation: 0,
    bounds: [0, 0, 20, 20],
  },
  features: [
    {
      id: 'base-floor-1-shell',
      kind: 'floor-shell',
      geometryType: 'polygon',
      coordinates: [[1, 1], [19, 1], [19, 19], [1, 19]],
      bbox: [1, 1, 19, 19],
      minZoom: -8,
      maxZoom: 24,
      name: 'Simplified footprint',
    },
    {
      id: 'wall-1',
      kind: 'wall',
      geometryType: 'path',
      coordinates: [[2, 2], [18, 2]],
      bbox: [2, 2, 18, 2.1],
      minZoom: -8,
      maxZoom: 24,
      width: 1,
    },
  ],
  stats: {
    featureCount: 2,
    byKind: { 'floor-shell': 1, wall: 1 },
    byZoomBand: { overview: 2, standard: 2, detail: 2 },
  },
} as const;

describe('prepared scene base geometry contract', () => {
  it('accepts a full-range floor-shell covering all feature bounds', () => {
    expect(PreparedSceneSchema.safeParse(preparedScene).success).toBe(true);
  });

  it('rejects a scene without a full-range floor-shell', () => {
    expect(PreparedSceneSchema.safeParse({
      ...preparedScene,
      features: preparedScene.features.slice(1),
    }).success).toBe(false);
    expect(PreparedSceneSchema.safeParse({
      ...preparedScene,
      features: [{ ...preparedScene.features[0], minZoom: 0 }, preparedScene.features[1]],
    }).success).toBe(false);
  });

  it('rejects a base shell that does not cover another feature bbox', () => {
    expect(PreparedSceneSchema.safeParse({
      ...preparedScene,
      features: [
        { ...preparedScene.features[0], bbox: [1, 1, 5, 5] },
        preparedScene.features[1],
      ],
    }).success).toBe(false);
  });
});
