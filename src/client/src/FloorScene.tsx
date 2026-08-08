import { useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import type { DeckGLRef } from '@deck.gl/react';
import { OrthographicView } from '@deck.gl/core';
import { IconLayer, PathLayer, PolygonLayer, TextLayer } from '@deck.gl/layers';
import type { DeviceMetadata } from '../../shared/domain-contracts';
import type { FloorSummary, SceneFeature, SceneResponse } from '../../shared/scene-contracts';
import { loadDeviceCatalog } from './device-api';
import { loadScene } from './scene-api';
import { fitFloor, viewStateToBBox, type SceneViewState } from './viewport';
import { useElementSize } from './use-element-size';

interface FloorSceneProps {
  floor: FloorSummary;
}

type PolygonFeature = Extract<SceneFeature, { geometryType: 'polygon' }>;
type PathFeature = Extract<SceneFeature, { geometryType: 'path' }>;
type PointFeature = Extract<SceneFeature, { geometryType: 'point' }>;
type DeviceIcon = 'light' | 'sensor' | 'fire' | 'hvac' | 'control' | 'access' | 'meter' | 'other';

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

const iconMapping: Record<DeviceIcon, {
  x: number;
  y: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  mask: boolean;
}> = Object.fromEntries(
  (['light', 'sensor', 'fire', 'hvac', 'control', 'access', 'meter', 'other'] as DeviceIcon[])
    .map((icon, index) => [icon, {
      x: index * 32,
      y: 0,
      width: 32,
      height: 32,
      anchorX: 16,
      anchorY: 16,
      mask: true,
    }]),
) as typeof iconMapping;

const iconByDeviceType: Record<DeviceMetadata['type'], DeviceIcon> = {
  light: 'light',
  'presence-sensor': 'sensor',
  'temperature-sensor': 'sensor',
  'co2-sensor': 'sensor',
  switch: 'control',
  actuator: 'control',
  'smoke-detector': 'fire',
  'heat-detector': 'fire',
  'fire-alarm-sounder': 'fire',
  'manual-pull-station': 'fire',
  sprinkler: 'fire',
  'security-sensor': 'sensor',
  'hvac-terminal': 'hvac',
  'hvac-unit': 'hvac',
  meter: 'meter',
  'electrical-controller': 'control',
  'access-controller': 'access',
  'solar-panel': 'meter',
  other: 'other',
};

const colorByIcon: Record<DeviceIcon, [number, number, number, number]> = {
  light: [255, 205, 92, 220],
  sensor: [97, 210, 199, 225],
  fire: [255, 105, 94, 235],
  hvac: [111, 171, 255, 225],
  control: [187, 157, 231, 225],
  access: [255, 156, 82, 225],
  meter: [131, 220, 147, 225],
  other: [194, 213, 212, 210],
};

export const FloorScene = ({ floor }: FloorSceneProps) => {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const [viewState, setViewState] = useState<SceneViewState>({
    target: [50, 50, 0], zoom: 2.5, minZoom: -1, maxZoom: 7,
  });
  const [scene, setScene] = useState<SceneResponse>();
  const [devices, setDevices] = useState<DeviceMetadata[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<DeviceMetadata>();
  const [error, setError] = useState<string>();
  const [deviceError, setDeviceError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const initialized = useRef(false);
  const deckRef = useRef<DeckGLRef<OrthographicView> | null>(null);

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

  useEffect(() => {
    const controller = new AbortController();
    setSelectedDevice(undefined);
    loadDeviceCatalog(floor.id, controller.signal)
      .then((catalog) => {
        setDevices(catalog.devices);
        setDeviceError(undefined);
      })
      .catch((requestError) => {
        if (!(requestError instanceof DOMException && requestError.name === 'AbortError')) {
          setDeviceError(requestError instanceof Error ? requestError.message : 'Unknown device error');
        }
      });
    return () => controller.abort();
  }, [floor.id]);

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
        pickable: false,
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
        pickable: false,
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
      new IconLayer<DeviceMetadata>({
        id: 'floor-devices',
        data: devices,
        iconAtlas: '/device-atlas.svg',
        iconMapping,
        getIcon: (device) => iconByDeviceType[device.type],
        getPosition: (device) => [device.position.x, device.position.y],
        getColor: (device) => device.id === selectedDevice?.id
          ? [255, 255, 255, 255]
          : colorByIcon[iconByDeviceType[device.type]],
        getSize: viewState.zoom < 2.8 ? 7 : viewState.zoom < 4.1 ? 10 : 14,
        sizeUnits: 'pixels',
        sizeMinPixels: 5,
        sizeMaxPixels: 20,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 90],
        updateTriggers: { getColor: selectedDevice?.id },
      }),
    ];
  }, [devices, scene, selectedDevice?.id, viewState.zoom]);

  const resetView = () => {
    if (size.width && size.height) setViewState(fitFloor(floor, size.width, size.height));
  };

  return (
    <div
      className="scene"
      ref={ref}
      data-testid="floor-scene"
      onClick={(event) => {
        if (!(event.target instanceof HTMLCanvasElement)) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const picked = deckRef.current?.pickObject({
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
          radius: 4,
          layerIds: ['floor-devices'],
        });
        if (picked?.object) setSelectedDevice(picked.object as DeviceMetadata);
      }}
    >
      <DeckGL
        ref={deckRef}
        views={new OrthographicView({ id: 'floor-view', flipY: false })}
        viewState={viewState}
        controller={{ dragPan: true, scrollZoom: true, doubleClickZoom: true, touchZoom: true }}
        layers={layers}
        getCursor={({ isDragging, isHovering }) => (
          isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'
        )}
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
        <span className={`status-dot ${error || deviceError ? 'status-dot--error' : ''}`} />
        {error ?? deviceError
          ?? `${scene?.zoomBand ?? 'loading'} · ${scene?.meta.returnedFeatures ?? 0}/${scene?.meta.totalFeatures ?? 0} features · ${devices.length} devices · z ${viewState.zoom.toFixed(2)}${loading ? ' · updating' : ''}`}
      </div>
      {selectedDevice && (
        <aside className="device-card" aria-label="Selected device">
          <button
            type="button"
            className="device-card__close"
            onClick={() => setSelectedDevice(undefined)}
            aria-label="Close device card"
          >×</button>
          <p className="device-card__eyebrow">SELECTED DEVICE</p>
          <h2>{selectedDevice.name}</h2>
          <dl>
            <div><dt>Type</dt><dd>{selectedDevice.type}</dd></div>
            <div><dt>Protocol</dt><dd>{selectedDevice.protocol}</dd></div>
            <div><dt>Origin</dt><dd>{selectedDevice.dataOrigin}</dd></div>
            <div><dt>Position</dt><dd>{selectedDevice.position.x.toFixed(2)}, {selectedDevice.position.y.toFixed(2)}</dd></div>
            <div><dt>Telemetry</dt><dd>{selectedDevice.capabilities.telemetry.length} channels</dd></div>
            <div><dt>Commands</dt><dd>{selectedDevice.capabilities.commands.length}</dd></div>
          </dl>
          <p className="device-card__id">{selectedDevice.id}</p>
        </aside>
      )}
    </div>
  );
};
