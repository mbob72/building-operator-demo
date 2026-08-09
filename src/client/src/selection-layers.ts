import { ScatterplotLayer } from '@deck.gl/layers';

interface SelectionIndicatorLayerOptions<T> {
  id: string;
  data: T[];
  getPosition: (item: T) => [number, number];
}

export const createSelectionIndicatorLayer = <T>({
  id,
  data,
  getPosition,
}: SelectionIndicatorLayerOptions<T>) => new ScatterplotLayer<T>({
  id,
  data,
  getPosition,
  filled: true,
  stroked: true,
  getFillColor: [85, 224, 214, 58],
  getLineColor: [238, 255, 253, 255],
  getRadius: 17,
  radiusUnits: 'pixels',
  radiusMinPixels: 17,
  radiusMaxPixels: 17,
  getLineWidth: 3,
  lineWidthUnits: 'pixels',
  pickable: false,
});
