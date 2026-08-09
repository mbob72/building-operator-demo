import type { SceneResponse } from '../../shared/scene-contracts';

export const sceneEmptyMessage = (scene: SceneResponse | undefined): string | undefined => {
  if (!scene || scene.meta.returnedFeatures > 0) return undefined;
  if (scene.meta.emptyReason === 'viewport-outside-floor') {
    return 'No floor geometry in this viewport. Use Fit to return.';
  }
  if (scene.meta.emptyReason === 'no-spatial-features') {
    return 'This viewport contains no prepared floor geometry.';
  }
  if (scene.meta.emptyReason === 'lod-filtered') {
    return 'Geometry exists here but is unavailable at this zoom.';
  }
  return 'The scene request returned no geometry.';
};
