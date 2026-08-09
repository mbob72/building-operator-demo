import type {
  BBox,
  SceneEmptyReason,
  SceneFeature,
} from '../shared/scene-contracts.js';

const intersects = (a: BBox, b: BBox) => (
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
);

const isVisibleAtZoom = (feature: SceneFeature, zoom: number) => (
  feature.minZoom <= zoom && feature.maxZoom >= zoom
);

export const selectSceneFeatures = (
  features: readonly SceneFeature[],
  floorBounds: BBox,
  viewport: BBox,
  zoom: number,
): { features: SceneFeature[]; emptyReason: SceneEmptyReason | null } => {
  if (!intersects(floorBounds, viewport)) {
    return { features: [], emptyReason: 'viewport-outside-floor' };
  }

  const spatialFeatures = features.filter((feature) => intersects(feature.bbox, viewport));
  if (spatialFeatures.length === 0) {
    return { features: [], emptyReason: 'no-spatial-features' };
  }

  const visibleFeatures = spatialFeatures.filter((feature) => isVisibleAtZoom(feature, zoom));
  return {
    features: visibleFeatures,
    emptyReason: visibleFeatures.length === 0 ? 'lod-filtered' : null,
  };
};
