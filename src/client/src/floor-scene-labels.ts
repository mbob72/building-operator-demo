import type { DeviceMetadata } from '../../shared/domain-contracts';
import {
  MAX_FLOOR_DEVICE_LABELS,
  PRIORITY_LABEL_MIN_ZOOM,
  VISIBLE_DEVICE_LABEL_MIN_ZOOM,
} from './floor-scene-config';
import type { ElementSize } from './use-element-size';
import { viewStateToBBox, type SceneViewState } from './viewport';

interface SelectFloorDeviceLabelsOptions {
  floorId: string;
  size: ElementSize;
  viewState: SceneViewState;
  devices: readonly DeviceMetadata[];
  priorityDevices: readonly DeviceMetadata[];
  selectedDevice: DeviceMetadata | undefined;
}

export const selectFloorDeviceLabels = ({
  floorId,
  size,
  viewState,
  devices,
  priorityDevices,
  selectedDevice,
}: SelectFloorDeviceLabelsOptions) => {
  const result = new Map<string, DeviceMetadata>();
  if (selectedDevice?.floorId === floorId) result.set(selectedDevice.id, selectedDevice);

  if (viewState.zoom >= PRIORITY_LABEL_MIN_ZOOM) {
    for (const device of priorityDevices) result.set(device.id, device);
  }

  if (viewState.zoom >= VISIBLE_DEVICE_LABEL_MIN_ZOOM && size.width && size.height) {
    const [minX, minY, maxX, maxY] = viewStateToBBox(viewState, size.width, size.height);
    for (const device of devices) {
      if (result.size >= MAX_FLOOR_DEVICE_LABELS) break;
      if (device.position.x >= minX && device.position.x <= maxX
        && device.position.y >= minY && device.position.y <= maxY) {
        result.set(device.id, device);
      }
    }
  }

  return [...result.values()];
};
