import { useMemo } from 'react';
import { PathLayer, PolygonLayer, TextLayer } from '@deck.gl/layers';
import type { Alarm, DeviceMetadata, DeviceStatus } from '../../shared/domain-contracts';
import type { SceneFeature, SceneResponse } from '../../shared/scene-contracts';
import {
  createDeviceIconLayer,
  deviceDataRanges,
  partitionDeviceItems,
} from './device-layers';
import { createAlarmIndicatorLayer } from './alarm-layers';
import { selectVisibleAlarmByDevice } from './alarm-model';
import { FLOOR_DEVICE_LAYER_IDS } from './floor-scene-config';
import { createSelectionIndicatorLayer } from './selection-layers';
import { featureColor } from './scene-visuals';
import type { ElementSize } from './use-element-size';
import type { SceneViewState } from './viewport';

type PolygonFeature = Extract<SceneFeature, { geometryType: 'polygon' }>;
type PathFeature = Extract<SceneFeature, { geometryType: 'path' }>;
type PointFeature = Extract<SceneFeature, { geometryType: 'point' }>;

interface UseFloorSceneLayersOptions {
  floorId: string;
  size: ElementSize;
  viewState: SceneViewState;
  scene: SceneResponse | undefined;
  devices: DeviceMetadata[];
  alarmDevices: DeviceMetadata[];
  alarmsById: ReadonlyMap<string, Alarm>;
  statusByDeviceId: ReadonlyMap<string, DeviceStatus>;
  dirtyStatusDeviceIds: ReadonlySet<string>;
  statusVersion: number;
  priorityMembershipVersion: number;
  priorityMembershipChanged: boolean;
  selectedDevice: DeviceMetadata | undefined;
}

export const useFloorSceneLayers = ({
  floorId,
  size,
  viewState,
  scene,
  devices,
  alarmDevices,
  alarmsById,
  statusByDeviceId,
  dirtyStatusDeviceIds,
  statusVersion,
  priorityMembershipVersion,
  priorityMembershipChanged,
  selectedDevice,
}: UseFloorSceneLayersOptions) => {
  const deviceGroups = useMemo(
    () => partitionDeviceItems(devices, (device) => device, statusByDeviceId),
    [devices, priorityMembershipVersion],
  );
  const alarmByDeviceId = useMemo(
    () => selectVisibleAlarmByDevice(alarmsById.values()),
    [alarmsById],
  );
  const alarmLayerData = useMemo(
    () => alarmDevices.filter((device) => alarmByDeviceId.has(device.id)),
    [alarmByDeviceId, alarmDevices],
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
      : deviceDataRanges(normalLayerData, (device) => device, dirtyStatusDeviceIds),
    [dirtyStatusDeviceIds, normalLayerData, priorityMembershipChanged],
  );
  const priorityDataDiff = useMemo(
    () => priorityMembershipChanged
      ? undefined
      : deviceDataRanges(priorityLayerData, (device) => device, dirtyStatusDeviceIds),
    [dirtyStatusDeviceIds, priorityLayerData, priorityMembershipChanged],
  );

  const layers = useMemo(() => {
    const polygonFeatures: PolygonFeature[] = [];
    const pathFeatures: PathFeature[] = [];
    const labels: PointFeature[] = [];
    for (const feature of scene?.features ?? []) {
      if (feature.geometryType === 'polygon') polygonFeatures.push(feature);
      else if (feature.geometryType === 'path') pathFeatures.push(feature);
      else labels.push(feature);
    }

    const getPosition = (device: DeviceMetadata): [number, number] => [
      device.position.x,
      device.position.y,
    ];
    const deviceLayerOptions = {
      getDevice: (device: DeviceMetadata) => device,
      getPosition,
      statusByDeviceId,
      selectedDeviceId: selectedDevice?.id,
      zoom: viewState.zoom,
      sizeMinPixels: 5,
    };

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
      createSelectionIndicatorLayer({
        id: 'floor-selected-device',
        data: selectedDevice?.floorId === floorId ? [selectedDevice] : [],
        getPosition,
      }),
      createDeviceIconLayer({
        ...deviceLayerOptions,
        id: FLOOR_DEVICE_LAYER_IDS[0],
        data: normalLayerData,
        dataDiff: normalDataDiff,
      }),
      createDeviceIconLayer({
        ...deviceLayerOptions,
        id: FLOOR_DEVICE_LAYER_IDS[1],
        data: priorityLayerData,
        dataDiff: priorityDataDiff,
      }),
      createAlarmIndicatorLayer({
        id: 'floor-alarm-indicators',
        data: alarmLayerData,
        getDevice: (device) => device,
        getPosition,
        alarmByDeviceId,
      }),
    ];
  }, [
    alarmByDeviceId,
    alarmLayerData,
    floorId,
    normalDataDiff,
    normalLayerData,
    priorityDataDiff,
    priorityLayerData,
    scene,
    selectedDevice?.id,
    statusByDeviceId,
    viewState.zoom,
  ]);

  return { layers, priorityDeviceCount: deviceGroups.priority.length };
};
