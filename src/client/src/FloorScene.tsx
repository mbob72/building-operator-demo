import { useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { OrthographicView } from '@deck.gl/core';
import { PathLayer, PolygonLayer, TextLayer } from '@deck.gl/layers';
import type { FloorSummary, SceneFeature, SceneResponse } from '../../shared/scene-contracts';
import { loadScene } from './scene-api';
import { fitFloor, viewStateToBBox, type SceneViewState } from './viewport';
import { useElementSize } from './use-element-size';

interface FloorSceneProps {
  floor: FloorSummary;
}

type PolygonFeature = Extract<SceneFeature, { geometryType: 'polygon' }>;
type PathFeature = Extract<SceneFeature, { geometryType: 'path' }>;
type PointFeature = Extract<SceneFeature, { geometryType: 'point' }>;

const featureColor: Record<SceneFeature['kind'], [number, number, number, number]> = {
  'floor-shell': [24, 43, 51, 255],
  zone: [24, 73, 82, 105],
  wall: [157, 189, 192, 255],
  column: [205, 224, 223, 255],
  door: [255, 179, 71, 255],
  window: [72, 183, 194, 255],
  stair: [167, 150, 203, 255],
  label: [204, 226, 225, 255],
};

export const FloorScene = ({ floor }: FloorSceneProps) => {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const [viewState, setViewState] = useState<SceneViewState>({
    target: [50, 50, 0], zoom: 2.5, minZoom: -1, maxZoom: 7,
  });
  const [scene, setScene] = useState<SceneResponse>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (!size.width || !size.height || initialized.current) return;
    setViewState(fitFloor(floor, size.width, size.height));
    initialized.current = true;
  }, [floor, size]);

  useEffect(() => {
    if (!size.width || !size.height) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const nextScene = await loadScene({
          floorId: floor.id,
          viewport: {
            bbox: viewStateToBBox(viewState, size.width, size.height),
            width: size.width,
            height: size.height,
          },
          zoom: viewState.zoom,
        }, controller.signal);
        setScene(nextScene);
        setError(undefined);
      } catch (requestError) {
        if (!(requestError instanceof DOMException && requestError.name === 'AbortError')) {
          setError(requestError instanceof Error ? requestError.message : 'Unknown scene error');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 100);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [floor.id, size.height, size.width, viewState]);

  const layers = useMemo(() => {
    const polygonFeatures = scene?.features.filter((feature) => feature.geometryType === 'polygon') ?? [];
    const pathFeatures = scene?.features.filter((feature) => feature.geometryType === 'path') ?? [];
    const labels = scene?.features.filter((feature) => feature.geometryType === 'point') ?? [];
    return [
      new PolygonLayer<PolygonFeature>({
        id: 'floor-polygons',
        data: polygonFeatures,
        getPolygon: (feature) => feature.coordinates,
        getFillColor: (feature) => featureColor[feature.kind],
        stroked: false,
        pickable: true,
      }),
      new PathLayer<PathFeature>({
        id: 'floor-paths',
        data: pathFeatures,
        getPath: (feature) => feature.coordinates,
        getColor: (feature) => featureColor[feature.kind],
        getWidth: (feature) => feature.width,
        widthUnits: 'pixels',
        widthMinPixels: 1,
        rounded: true,
        pickable: true,
      }),
      new TextLayer<PointFeature>({
        id: 'floor-labels',
        data: labels,
        getPosition: (feature) => feature.coordinates,
        getText: (feature) => feature.text,
        getColor: featureColor.label,
        getSize: 13,
        sizeUnits: 'pixels',
        fontFamily: 'IBM Plex Mono, monospace',
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
      }),
    ];
  }, [scene]);

  const resetView = () => {
    if (size.width && size.height) setViewState(fitFloor(floor, size.width, size.height));
  };

  return (
    <div className="scene" ref={ref} data-testid="floor-scene">
      <DeckGL
        views={new OrthographicView({ id: 'floor-view', flipY: false })}
        viewState={viewState}
        controller={{ dragPan: true, scrollZoom: true, doubleClickZoom: true, touchZoom: true }}
        layers={layers}
        onViewStateChange={({ viewState: nextViewState }) => {
          const target = nextViewState.target ?? viewState.target;
          const zoom = typeof nextViewState.zoom === 'number' ? nextViewState.zoom : viewState.zoom;
          setViewState({
            target: [target[0], target[1], target[2] ?? 0],
            zoom,
            minZoom: -1,
            maxZoom: 7,
          });
        }}
      />
      <div className="scene__tools">
        <button type="button" onClick={() => setViewState((current) => ({ ...current, zoom: Math.min(current.maxZoom, current.zoom + 0.35) }))} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => setViewState((current) => ({ ...current, zoom: Math.max(current.minZoom, current.zoom - 0.35) }))} aria-label="Zoom out">−</button>
        <button type="button" className="scene__fit" onClick={resetView}>Fit</button>
      </div>
      <div className="scene__status" aria-live="polite">
        <span className={`status-dot ${error ? 'status-dot--error' : ''}`} />
        {error
          ? error
          : `${scene?.zoomBand ?? 'loading'} · ${scene?.meta.returnedFeatures ?? 0}/${scene?.meta.totalFeatures ?? 0} features · z ${viewState.zoom.toFixed(2)}${loading ? ' · updating' : ''}`}
      </div>
    </div>
  );
};
