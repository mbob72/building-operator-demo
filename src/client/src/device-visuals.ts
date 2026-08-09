import type {
  DeviceMetadata,
  DeviceStatus,
  DeviceType,
} from '../../shared/domain-contracts';
import { DeviceTypeSchema } from '../../shared/domain-contracts';

export type DeviceIcon = DeviceType;
export type DeckColor = [number, number, number, number];

export const DEVICE_ICON_ATLAS_CELL_SIZE = 32;
export const deviceIconOrder: readonly DeviceIcon[] = DeviceTypeSchema.options;

export const iconMapping: Record<DeviceIcon, {
  x: number;
  y: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  mask: boolean;
}> = Object.fromEntries(
  deviceIconOrder.map((icon, index) => [icon, {
      x: index * DEVICE_ICON_ATLAS_CELL_SIZE,
      y: 0,
      width: DEVICE_ICON_ATLAS_CELL_SIZE,
      height: DEVICE_ICON_ATLAS_CELL_SIZE,
      anchorX: DEVICE_ICON_ATLAS_CELL_SIZE / 2,
      anchorY: DEVICE_ICON_ATLAS_CELL_SIZE / 2,
      mask: true,
    }]),
) as typeof iconMapping;

export const iconByDeviceType = Object.fromEntries(
  deviceIconOrder.map((type) => [type, type]),
) as Record<DeviceType, DeviceIcon>;

const colorByIcon: Record<DeviceIcon, DeckColor> = {
  light: [255, 205, 92, 220],
  'presence-sensor': [97, 210, 199, 225],
  'temperature-sensor': [104, 193, 255, 225],
  'co2-sensor': [105, 211, 160, 225],
  switch: [187, 157, 231, 225],
  actuator: [174, 142, 224, 225],
  'smoke-detector': [255, 105, 94, 235],
  'heat-detector': [255, 139, 82, 235],
  'fire-alarm-sounder': [255, 116, 105, 235],
  'manual-pull-station': [238, 91, 86, 235],
  sprinkler: [91, 178, 235, 225],
  'security-sensor': [238, 160, 99, 225],
  'hvac-terminal': [111, 171, 255, 225],
  'hvac-unit': [92, 154, 235, 225],
  meter: [131, 220, 147, 225],
  'electrical-controller': [232, 194, 94, 225],
  'access-controller': [255, 156, 82, 225],
  'solar-panel': [170, 214, 104, 225],
  other: [194, 213, 212, 210],
};

export const statusColor: Record<DeviceStatus, DeckColor> = {
  normal: [97, 210, 199, 225],
  warning: [255, 190, 66, 255],
  critical: [255, 73, 70, 255],
  offline: [104, 121, 124, 205],
  unknown: [155, 164, 165, 205],
};

export const iconForDevice = (device: DeviceMetadata): DeviceIcon => iconByDeviceType[device.type];

export const colorForDevice = (
  device: DeviceMetadata,
  status: DeviceStatus,
  selected: boolean,
): DeckColor => {
  if (selected) return [255, 255, 255, 255];
  if (status !== 'normal') return statusColor[status];
  return colorByIcon[iconForDevice(device)];
};

export const isPriorityStatus = (status: DeviceStatus) => status === 'warning' || status === 'critical';

export const deviceSizeForZoom = (zoom: number, status: DeviceStatus): number => {
  if (status === 'critical') return zoom < 2.8 ? 13 : zoom < 4.1 ? 16 : 19;
  if (status === 'warning') return zoom < 2.8 ? 11 : zoom < 4.1 ? 14 : 17;
  return zoom < 2.8 ? 7 : zoom < 4.1 ? 10 : 14;
};
