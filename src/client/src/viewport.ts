import type { BBox, FloorSummary } from '../../shared/scene-contracts';

export interface SceneViewState {
  target: [number, number, number];
  zoom: number;
  minZoom: number;
  maxZoom: number;
}

export const viewStateToBBox = (
  viewState: Pick<SceneViewState, 'target' | 'zoom'>,
  width: number,
  height: number,
): BBox => {
  const scale = 2 ** viewState.zoom;
  const halfWidth = width / (2 * scale);
  const halfHeight = height / (2 * scale);
  const [x, y] = viewState.target;
  return [x - halfWidth, y - halfHeight, x + halfWidth, y + halfHeight];
};

export const fitFloor = (floor: FloorSummary, width: number, height: number): SceneViewState => {
  const [minX, minY, maxX, maxY] = floor.bounds;
  const floorWidth = maxX - minX;
  const floorHeight = maxY - minY;
  const fitScale = Math.min(width / floorWidth, height / floorHeight) * 0.86;
  return {
    target: [(minX + maxX) / 2, (minY + maxY) / 2, 0],
    zoom: Math.log2(fitScale),
    minZoom: -1,
    maxZoom: 7,
  };
};
