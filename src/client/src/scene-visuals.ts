import type { SceneFeature } from '../../shared/scene-contracts';

export const featureColor: Record<SceneFeature['kind'], [number, number, number, number]> = {
  'floor-shell': [24, 43, 51, 255],
  zone: [24, 73, 82, 105],
  wall: [157, 189, 192, 255],
  column: [205, 224, 223, 255],
  door: [255, 179, 71, 255],
  window: [72, 183, 194, 255],
  stair: [167, 150, 203, 255],
  label: [204, 226, 225, 255],
};

export const zoomBandFor = (zoom: number): 'overview' | 'standard' | 'detail' => {
  if (zoom < 1.7) return 'overview';
  if (zoom < 4.1) return 'standard';
  return 'detail';
};

export const representativeZoom = (band: 'overview' | 'standard' | 'detail'): number => {
  if (band === 'overview') return 1;
  if (band === 'standard') return 3;
  return 5;
};
