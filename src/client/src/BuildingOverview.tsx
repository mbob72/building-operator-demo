import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import DeckGL from '@deck.gl/react';
import type { DeckGLRef } from '@deck.gl/react';
import { OrthographicView } from '@deck.gl/core';
import { PathLayer, PolygonLayer, TextLayer } from '@deck.gl/layers';
import type {
  DeviceMetadata,
  DeviceStatus,
} from '../../shared/domain-contracts';
import type { FloorSummary, SceneFeature } from '../../shared/scene-contracts';
import { DeviceCard } from './DeviceCard';
import {
  createDeviceIconLayer,
  deviceDataRanges,
  partitionDeviceItems,
} from './device-layers';
import { SceneControls } from './SceneControls';
import { featureColor, representativeZoom, zoomBandFor } from './scene-visuals';
import { loadScene } from './scene-api';
import { fitBounds, viewStateToBBox, type SceneViewState } from './viewport';
import { useElementSize } from './use-element-size';

interface BuildingOverviewProps {
  floors: FloorSummary[];
  devices: DeviceMetadata[];
  statusByDeviceId: ReadonlyMap<string, DeviceStatus>;
  dirtyStatusDeviceIds: ReadonlySet<string>;
  statusVersion: number;
  priorityMembershipVersion: number;
  priorityMembershipChanged: boolean;
  selectedDevice: DeviceMetadata | undefined;
  onSelectDevice: (deviceId?: string) => void;
}

type PolygonFeature = Extract<SceneFeature, { geometryType: 'polygon' }>;
type PathFeature = Extract<SceneFeature, { geometryType: 'path' }>;
type PointFeature = Extract<SceneFeature, { geometryType: 'point' }>;
type Offset = [number, number];

interface FloorLayout {
  floor: FloorSummary;
  offset: Offset;
}

interface OffsetFeature<T extends SceneFeature> {
  feature: T;
  offset: Offset;
}

interface OffsetDevice {
  device: DeviceMetadata;
  offset: Offset;
}

const buildLayout = (floors: FloorSummary[], columns: number) => {
  const gap = 26;
  const titleSpace = 12;
  const maxWidth = Math.max(...floors.map((floor) => floor.bounds[2] - floor.bounds[0]));
  const maxHeight = Math.max(...floors.map((floor) => floor.bounds[3] - floor.bounds[1]));
  const cellWidth = maxWidth + gap;
  const cellHeight = maxHeight + gap + titleSpace;
  const rows = Math.ceil(floors.length / columns);
  const items: FloorLayout[] = floors.map((floor, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      floor,
      offset: [
        column * cellWidth - floor.bounds[0],
        (rows - row - 1) * cellHeight - floor.bounds[1],
      ],
    };
  });
  return {
    items,
    bounds: [0, 0, columns * cellWidth - gap, rows * cellHeight - gap] as const,
    key: `${columns}:${floors.map((floor) => floor.id).join(',')}`,
  };
};

export const BuildingOverview = ({
  floors,
  devices,
  statusByDeviceId,
  dirtyStatusDeviceIds,
  statusVersion,
  priorityMembershipVersion,
  priorityMembershipChanged,
  selectedDevice,
  onSelectDevice,
}: BuildingOverviewProps) => {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const columns = size.width > 0 && size.width < 720 ? 2 : 4;
  const layout = useMemo(() => buildLayout(floors, columns), [columns, floors]);
  const layoutByFloorId = useMemo(
    () => new Map(layout.items.map((item) => [item.floor.id, item])),
    [layout.items],
  );
  const [viewState, setViewState] = useState<SceneViewState>({
    target: [200, 100, 0], zoom: 1, minZoom: -2, maxZoom: 7,
  });
  const fittedLayout = useRef<string | undefined>(undefined);
  const deckRef = useRef<DeckGLRef<OrthographicView> | null>(null);
  const band = zoomBandFor(viewState.zoom);
  const sceneQueries = useQueries({
    queries: floors.map((floor) => ({
      queryKey: ['overview-scene', floor.id, band],
      queryFn: ({ signal }: { signal: AbortSignal }) => loadScene({
        floorId: floor.id,
        viewport: { bbox: floor.bounds, width: 1_024, height: 1_024 },
        zoom: representativeZoom(band),
      }, signal),
      staleTime: 5 * 60_000,
      placeholderData: (previous: Awaited<ReturnType<typeof loadScene>> | undefined) => previous,
    })),
  });

  useEffect(() => {
    if (!size.width || !size.height || fittedLayout.current === layout.key) return;
    setViewState({ ...fitBounds([...layout.bounds], size.width, size.height), minZoom: -2, maxZoom: 7 });
    fittedLayout.current = layout.key;
  }, [layout.bounds, layout.key, size.height, size.width]);

  const sceneKey = sceneQueries
    .map((query) => `${query.data?.sceneVersion ?? 'loading'}:${query.data?.zoomBand ?? ''}:${query.data?.features.length ?? 0}`)
    .join('|');
  const sceneData = useMemo(() => {
    const polygons: OffsetFeature<PolygonFeature>[] = [];
    const paths: OffsetFeature<PathFeature>[] = [];
    const labels: OffsetFeature<PointFeature>[] = [];
    for (const query of sceneQueries) {
      if (!query.data) continue;
      const floorLayout = layoutByFloorId.get(query.data.floor.id);
      if (!floorLayout) continue;
      for (const feature of query.data.features) {
        const wrapped = { feature, offset: floorLayout.offset };
        if (feature.geometryType === 'polygon') polygons.push(wrapped as OffsetFeature<PolygonFeature>);
        else if (feature.geometryType === 'path') paths.push(wrapped as OffsetFeature<PathFeature>);
        else labels.push(wrapped as OffsetFeature<PointFeature>);
      }
    }
    return { polygons, paths, labels };
    // sceneKey tracks the meaningful query payload revisions without rebuilding on pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutByFloorId, sceneKey]);

  const offsetDevices = useMemo(() => devices.flatMap((device): OffsetDevice[] => {
    const floorLayout = layoutByFloorId.get(device.floorId);
    return floorLayout ? [{ device, offset: floorLayout.offset }] : [];
  }), [devices, layoutByFloorId]);

  const deviceGroups = useMemo(
    () => partitionDeviceItems(offsetDevices, (item) => item.device, statusByDeviceId),
    [offsetDevices, priorityMembershipVersion],
  );
  const normalLayerData = useMemo(
    () => [...deviceGroups.normal],
    [deviceGroups.normal, statusVersion],
  );
  const priorityLayerData = useMemo(
    () => [...deviceGroups.priority],
    [deviceGroups.priority, statusVersion],
  );
  const normalDataDiff = useMemo(
    () => priorityMembershipChanged
      ? undefined
      : deviceDataRanges(normalLayerData, (item) => item.device, dirtyStatusDeviceIds),
    [dirtyStatusDeviceIds, normalLayerData, priorityMembershipChanged],
  );
  const priorityDataDiff = useMemo(
    () => priorityMembershipChanged
      ? undefined
      : deviceDataRanges(priorityLayerData, (item) => item.device, dirtyStatusDeviceIds),
    [dirtyStatusDeviceIds, priorityLayerData, priorityMembershipChanged],
  );

  const deviceLabels = useMemo(() => {
    const result = new Map<string, OffsetDevice>();
    if (selectedDevice) {
      const layoutItem = layoutByFloorId.get(selectedDevice.floorId);
      if (layoutItem) result.set(selectedDevice.id, { device: selectedDevice, offset: layoutItem.offset });
    }
    if (viewState.zoom >= 5.2 && size.width && size.height) {
      const [minX, minY, maxX, maxY] = viewStateToBBox(viewState, size.width, size.height);
      for (const item of offsetDevices) {
        if (result.size >= 180) break;
        const x = item.device.position.x + item.offset[0];
        const y = item.device.position.y + item.offset[1];
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) result.set(item.device.id, item);
      }
    }
    return [...result.values()];
  }, [layoutByFloorId, offsetDevices, selectedDevice, size.height, size.width, viewState]);

  const layers = useMemo(() => {
    const position = (item: OffsetDevice): [number, number] => [
      item.device.position.x + item.offset[0],
      item.device.position.y + item.offset[1],
    ];
    const deviceLayerOptions = {
      getDevice: (item: OffsetDevice) => item.device,
      getPosition: position,
      statusByDeviceId,
      selectedDeviceId: selectedDevice?.id,
      zoom: viewState.zoom,
      sizeMinPixels: 4,
    };

    return [
      new PolygonLayer<OffsetFeature<PolygonFeature>>({
        id: 'overview-polygons',
        data: sceneData.polygons,
        getPolygon: ({ feature, offset }) => feature.coordinates.map(([x, y]) => [x + offset[0], y + offset[1]]),
        getFillColor: ({ feature }) => featureColor[feature.kind],
        stroked: false,
        pickable: false,
      }),
      new PathLayer<OffsetFeature<PathFeature>>({
        id: 'overview-paths',
        data: sceneData.paths,
        getPath: ({ feature, offset }) => feature.coordinates.map(
          ([x, y]): [number, number] => [x + offset[0], y + offset[1]],
        ),
        getColor: ({ feature }) => featureColor[feature.kind],
        getWidth: ({ feature }) => feature.width,
        widthUnits: 'pixels',
        widthMinPixels: 1,
        jointRounded: true,
        capRounded: true,
        pickable: false,
      }),
      new TextLayer<OffsetFeature<PointFeature>>({
        id: 'overview-scene-labels',
        data: sceneData.labels,
        getPosition: ({ feature, offset }) => [feature.coordinates[0] + offset[0], feature.coordinates[1] + offset[1]],
        getText: ({ feature }) => feature.text,
        getColor: featureColor.label,
        getSize: 11,
        sizeUnits: 'pixels',
        fontFamily: 'IBM Plex Mono, monospace',
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
      }),
      new TextLayer<FloorLayout>({
        id: 'overview-floor-titles',
        data: layout.items,
        getPosition: ({ floor, offset }) => [
          offset[0] + (floor.bounds[0] + floor.bounds[2]) / 2,
          offset[1] + floor.bounds[3] + 8,
        ],
        getText: ({ floor }) => floor.name.replace('West Riverside Hospital · ', ''),
        getColor: [128, 205, 201, 255],
        getSize: 12,
        sizeUnits: 'pixels',
        fontFamily: 'IBM Plex Mono, monospace',
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
      }),
      createDeviceIconLayer({
        ...deviceLayerOptions,
        id: 'overview-devices',
        data: normalLayerData,
        dataDiff: normalDataDiff,
      }),
      createDeviceIconLayer({
        ...deviceLayerOptions,
        id: 'overview-priority-devices',
        data: priorityLayerData,
        dataDiff: priorityDataDiff,
      }),
      new TextLayer<OffsetDevice>({
        id: 'overview-device-labels',
        data: deviceLabels,
        getPosition: position,
        getText: ({ device }) => device.name,
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
  }, [
    deviceLabels,
    layout.items,
    normalDataDiff,
    normalLayerData,
    priorityDataDiff,
    priorityLayerData,
    sceneData,
    selectedDevice?.id,
    statusByDeviceId,
    viewState.zoom,
  ]);

  const resetView = () => {
    if (size.width && size.height) {
      setViewState({ ...fitBounds([...layout.bounds], size.width, size.height), minZoom: -2, maxZoom: 7 });
    }
  };

  const queryError = sceneQueries.find((query) => query.error)?.error;
  const loadedScenes = sceneQueries.filter((query) => query.data).length;
  const emptyScenes = sceneQueries.filter((query) => query.data?.meta.returnedFeatures === 0).length;

  return (
    <div
      className="scene"
      ref={ref}
      data-testid="building-overview"
      onClick={(event) => {
        if (!(event.target instanceof HTMLCanvasElement)) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const picked = deckRef.current?.pickObject({
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
          radius: 4,
          layerIds: ['overview-devices', 'overview-priority-devices'],
        });
        if (picked?.object) onSelectDevice((picked.object as OffsetDevice).device.id);
      }}
    >
      <DeckGL
        ref={deckRef}
        views={new OrthographicView({ id: 'building-view', flipY: false })}
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
            minZoom: -2,
            maxZoom: 7,
          });
        }}
      />
      <SceneControls viewState={viewState} setViewState={setViewState} onFit={resetView} />
      <div className="scene__status" aria-live="polite">
        <span className={`status-dot ${queryError ? 'status-dot--error' : ''}`} />
        {queryError instanceof Error
          ? queryError.message
          : `${band} · ${loadedScenes}/${floors.length} floors${emptyScenes ? ` · ${emptyScenes} empty` : ''} · ${devices.length} devices · ${deviceGroups.priority.length} priority · z ${viewState.zoom.toFixed(2)}${sceneQueries.some((query) => query.isFetching) ? ' · updating' : ''}`}
      </div>
      {selectedDevice && (
        <DeviceCard
          device={selectedDevice}
          floors={floors}
          onClose={() => onSelectDevice(undefined)}
        />
      )}
    </div>
  );
};
