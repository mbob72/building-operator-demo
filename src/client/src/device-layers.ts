import { IconLayer } from '@deck.gl/layers';
import type {
  DeviceMetadata,
  DeviceStatus,
} from '../../shared/domain-contracts';
import {
  colorForDevice,
  deviceSizeForZoom,
  iconForDevice,
  iconMapping,
  isPriorityStatus,
} from './device-visuals';

export const statusForDevice = (
  statusByDeviceId: ReadonlyMap<string, DeviceStatus>,
  deviceId: string,
): DeviceStatus => statusByDeviceId.get(deviceId) ?? 'unknown';

export const partitionDeviceItems = <T>(
  items: readonly T[],
  getDevice: (item: T) => DeviceMetadata,
  statusByDeviceId: ReadonlyMap<string, DeviceStatus>,
) => {
  const normal: T[] = [];
  const priority: T[] = [];
  for (const item of items) {
    const device = getDevice(item);
    if (isPriorityStatus(statusForDevice(statusByDeviceId, device.id))) priority.push(item);
    else normal.push(item);
  }
  return { normal, priority };
};

export interface DeviceDataRange {
  startRow: number;
  endRow: number;
}

export const deviceDataRanges = <T>(
  data: readonly T[],
  getDevice: (item: T) => DeviceMetadata,
  dirtyDeviceIds: ReadonlySet<string>,
): DeviceDataRange[] => {
  const ranges: DeviceDataRange[] = [];
  for (let index = 0; index < data.length; index += 1) {
    if (!dirtyDeviceIds.has(getDevice(data[index]!).id)) continue;
    const previous = ranges.at(-1);
    if (previous?.endRow === index) previous.endRow = index + 1;
    else ranges.push({ startRow: index, endRow: index + 1 });
  }
  return ranges;
};

interface DeviceIconLayerOptions<T> {
  id: string;
  data: T[];
  getDevice: (item: T) => DeviceMetadata;
  getPosition: (item: T) => [number, number];
  statusByDeviceId: ReadonlyMap<string, DeviceStatus>;
  selectedDeviceId: string | undefined;
  zoom: number;
  sizeMinPixels: number;
  dataDiff: DeviceDataRange[] | undefined;
}

export const createDeviceIconLayer = <T>({
  id,
  data,
  getDevice,
  getPosition,
  statusByDeviceId,
  selectedDeviceId,
  zoom,
  sizeMinPixels,
  dataDiff,
}: DeviceIconLayerOptions<T>) => new IconLayer<T>({
  id,
  data,
  iconAtlas: '/device-atlas.svg',
  iconMapping,
  getIcon: (item) => iconForDevice(getDevice(item)),
  getPosition,
  getColor: (item) => {
    const device = getDevice(item);
    return colorForDevice(
      device,
      statusForDevice(statusByDeviceId, device.id),
      device.id === selectedDeviceId,
    );
  },
  getSize: (item) => {
    const device = getDevice(item);
    return deviceSizeForZoom(zoom, statusForDevice(statusByDeviceId, device.id));
  },
  sizeUnits: 'pixels',
  sizeMinPixels,
  sizeMaxPixels: 22,
  pickable: true,
  autoHighlight: true,
  highlightColor: [255, 255, 255, 90],
  ...(dataDiff ? { _dataDiff: () => dataDiff } : {}),
  updateTriggers: {
    getColor: [selectedDeviceId],
    getSize: [zoom],
  },
});
