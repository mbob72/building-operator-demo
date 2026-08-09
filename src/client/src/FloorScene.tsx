import { useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import type { DeckGLRef } from '@deck.gl/react';
import { OrthographicView } from '@deck.gl/core';
import { IconLayer, PathLayer, PolygonLayer, TextLayer } from '@deck.gl/layers';
import type {
  DeviceMetadata,
  DeviceStatus,
  DeviceTelemetry,
} from '../../shared/domain-contracts';
import type { FloorSummary, SceneFeature, SceneResponse } from '../../shared/scene-contracts';
import { DeviceCard } from './DeviceCard';
import {
  colorForDevice,
  deviceSizeForZoom,
  iconForDevice,
  iconMapping,
  isPriorityStatus,
} from './device-visuals';
import { loadScene } from './scene-api';
import { featureColor } from './scene-visuals';
import { fitFloor, viewStateToBBox, type SceneViewState } from './viewport';
import { useElementSize } from './use-element-size';

interface FloorSceneProps {
  floor: FloorSummary;
  floors: FloorSummary[];
  devices: DeviceMetadata[];
  telemetryByDeviceId: ReadonlyMap<string, DeviceTelemetry>;
  selectedDevice: DeviceMetadata | undefined;
  onSelectDevice: (deviceId?: string) => void;
}

type PolygonFeature = Extract<SceneFeature, { geometryType: 'polygon' }>;
type PathFeature = Extract<SceneFeature, { geometryType: 'path' }>;
type PointFeature = Extract<SceneFeature, { geometryType: 'point' }>;

const statusOf = (
  telemetryByDeviceId: ReadonlyMap<string, DeviceTelemetry>,
  deviceId: string,
): DeviceStatus => telemetryByDeviceId.get(deviceId)?.status ?? 'unknown';

export const FloorScene = ({
  floor,
  floors,
  devices,
  telemetryByDeviceId,
  selectedDevice,
  onSelectDevice,
}: FloorSceneProps) => {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const [viewState, setViewState] = useState<SceneViewState>({
    target: [50, 50, 0], zoom: 2.5, minZoom: -1, maxZoom: 7,
  });
  const [scene, setScene] = useState<SceneResponse>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const initializedFloor = useRef<string | undefined>(undefined);
  const deckRef = useRef<DeckGLRef<OrthographicView> | null>(null);

  useEffect(() => {
    if (!size.width || !size.height || initializedFloor.current === floor.id) return;
    setViewState(fitFloor(floor, size.width, size.height));
    initializedFloor.current = floor.id;
    setScene(undefined);
  }, [floor, size.height, size.width]);

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

  const deviceGroups = useMemo(() => {
    const normal: DeviceMetadata[] = [];
    const priority: DeviceMetadata[] = [];
    for (const device of devices) {
      if (isPriorityStatus(statusOf(telemetryByDeviceId, device.id))) priority.push(device);
      else normal.push(device);
    }
    return { normal, priority };
  }, [devices, telemetryByDeviceId]);

  const deviceLabels = useMemo(() => {
    const result = new Map<string, DeviceMetadata>();
    if (selectedDevice?.floorId === floor.id) result.set(selectedDevice.id, selectedDevice);
    if (viewState.zoom >= 3.4) {
      for (const device of deviceGroups.priority) result.set(device.id, device);
    }
    if (viewState.zoom >= 5.2 && size.width && size.height) {
      const [minX, minY, maxX, maxY] = viewStateToBBox(viewState, size.width, size.height);
      for (const device of devices) {
        if (result.size >= 180) break;
        if (device.position.x >= minX && device.position.x <= maxX
          && device.position.y >= minY && device.position.y <= maxY) {
          result.set(device.id, device);
        }
      }
    }
    return [...result.values()];
  }, [deviceGroups.priority, devices, floor.id, selectedDevice, size.height, size.width, viewState]);

  const layers = useMemo(() => {
    const polygonFeatures = scene?.features.filter((feature) => feature.geometryType === 'polygon') ?? [];
    const pathFeatures = scene?.features.filter((feature) => feature.geometryType === 'path') ?? [];
    const labels = scene?.features.filter((feature) => feature.geometryType === 'point') ?? [];

    const deviceLayer = (id: string, data: DeviceMetadata[]) => new IconLayer<DeviceMetadata>({
      id,
      data,
      iconAtlas: '/device-atlas.svg',
      iconMapping,
      getIcon: iconForDevice,
      getPosition: (device) => [device.position.x, device.position.y],
      getColor: (device) => colorForDevice(
        device,
        statusOf(telemetryByDeviceId, device.id),
        device.id === selectedDevice?.id,
      ),
      getSize: (device) => deviceSizeForZoom(viewState.zoom, statusOf(telemetryByDeviceId, device.id)),
      sizeUnits: 'pixels',
      sizeMinPixels: 5,
      sizeMaxPixels: 22,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 90],
      updateTriggers: {
        getColor: [selectedDevice?.id, telemetryByDeviceId],
        getSize: [viewState.zoom, telemetryByDeviceId],
      },
    });

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
        jointRounded: true,
        capRounded: true,
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
      deviceLayer('floor-devices', deviceGroups.normal),
      deviceLayer('floor-priority-devices', deviceGroups.priority),
      new TextLayer<DeviceMetadata>({
        id: 'device-labels',
        data: deviceLabels,
        getPosition: (device) => [device.position.x, device.position.y],
        getText: (device) => device.name,
        getColor: [228, 241, 240, 245],
        getSize: 11,
        getPixelOffset: [0, -13],
        sizeUnits: 'pixels',
        fontFamily: 'IBM Plex Mono, monospace',
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'bottom',
        background: true,
        getBackgroundColor: [7, 19, 23, 220],
        backgroundPadding: [3, 2],
      }),
    ];
  }, [deviceGroups, deviceLabels, scene, selectedDevice?.id, telemetryByDeviceId, viewState.zoom]);

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
          layerIds: ['floor-devices', 'floor-priority-devices'],
        });
        if (picked?.object) onSelectDevice((picked.object as DeviceMetadata).id);
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
        <span className={`status-dot ${error ? 'status-dot--error' : ''}`} />
        {error
          ?? `${scene?.zoomBand ?? 'loading'} · ${scene?.meta.returnedFeatures ?? 0}/${scene?.meta.totalFeatures ?? 0} features · ${devices.length} devices · ${deviceGroups.priority.length} priority · z ${viewState.zoom.toFixed(2)}${loading ? ' · updating' : ''}`}
      </div>
      {selectedDevice && selectedDevice.floorId === floor.id && (
        <DeviceCard
          device={selectedDevice}
          telemetry={telemetryByDeviceId.get(selectedDevice.id)}
          floors={floors}
          onClose={() => onSelectDevice(undefined)}
        />
      )}
    </div>
  );
};
