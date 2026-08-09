import { IconLayer } from '@deck.gl/layers';
import type {
  DeviceMetadata,
  DeviceStatus,
  DeviceTelemetry,
} from '../../shared/domain-contracts';
import {
  colorForDevice,
  deviceSizeForZoom,
  iconForDevice,
  iconMapping,
  isPriorityStatus,
} from './device-visuals';

export const statusForDevice = (
  telemetryByDeviceId: ReadonlyMap<string, DeviceTelemetry>,
  deviceId: string,
): DeviceStatus => telemetryByDeviceId.get(deviceId)?.status ?? 'unknown';

export const partitionDeviceItems = <T>(
  items: readonly T[],
  getDevice: (item: T) => DeviceMetadata,
  telemetryByDeviceId: ReadonlyMap<string, DeviceTelemetry>,
) => {
  const normal: T[] = [];
  const priority: T[] = [];
  for (const item of items) {
    const device = getDevice(item);
    if (isPriorityStatus(statusForDevice(telemetryByDeviceId, device.id))) priority.push(item);
    else normal.push(item);
  }
  return { normal, priority };
};

interface DeviceIconLayerOptions<T> {
  id: string;
  data: T[];
  getDevice: (item: T) => DeviceMetadata;
  getPosition: (item: T) => [number, number];
  telemetryByDeviceId: ReadonlyMap<string, DeviceTelemetry>;
  selectedDeviceId: string | undefined;
  zoom: number;
  sizeMinPixels: number;
}

export const createDeviceIconLayer = <T>({
  id,
  data,
  getDevice,
  getPosition,
  telemetryByDeviceId,
  selectedDeviceId,
  zoom,
  sizeMinPixels,
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
      statusForDevice(telemetryByDeviceId, device.id),
      device.id === selectedDeviceId,
    );
  },
  getSize: (item) => {
    const device = getDevice(item);
    return deviceSizeForZoom(zoom, statusForDevice(telemetryByDeviceId, device.id));
  },
  sizeUnits: 'pixels',
  sizeMinPixels,
  sizeMaxPixels: 22,
  pickable: true,
  autoHighlight: true,
  highlightColor: [255, 255, 255, 90],
  updateTriggers: {
    getColor: [selectedDeviceId, telemetryByDeviceId],
    getSize: [zoom, telemetryByDeviceId],
  },
});
