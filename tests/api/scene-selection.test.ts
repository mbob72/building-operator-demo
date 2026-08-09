import { describe, expect, it } from 'vitest';
import type { BBox, SceneFeature } from '../../src/shared/scene-contracts';
import { selectSceneFeatures } from '../../src/server/scene-selection';

const floorBounds: BBox = [0, 0, 20, 20];
const detailFeature: SceneFeature = {
  id: 'detail-wall',
  kind: 'wall',
  geometryType: 'path',
  coordinates: [[0, 0], [10, 10]],
  bbox: [0, 0, 10, 10],
  minZoom: 4,
  maxZoom: 24,
  width: 1,
};

describe('scene spatial and LOD selection', () => {
  it('distinguishes a viewport outside floor bounds', () => {
    expect(selectSceneFeatures([detailFeature], floorBounds, [30, 30, 40, 40], 5))
      .toEqual({ features: [], emptyReason: 'viewport-outside-floor' });
  });

  it('distinguishes an in-floor viewport without spatial candidates', () => {
    expect(selectSceneFeatures([detailFeature], floorBounds, [15, 15, 18, 18], 5))
      .toEqual({ features: [], emptyReason: 'no-spatial-features' });
  });

  it('distinguishes candidates removed by LOD and clears the reason when visible', () => {
    expect(selectSceneFeatures([detailFeature], floorBounds, [1, 1, 2, 2], 3))
      .toEqual({ features: [], emptyReason: 'lod-filtered' });
    expect(selectSceneFeatures([detailFeature], floorBounds, [1, 1, 2, 2], 5))
      .toEqual({ features: [detailFeature], emptyReason: null });
  });
});
