import type {
  DeviceMetadata,
  DeviceStatus,
  DeviceType,
} from '../../shared/domain-contracts';

export type DeviceIcon = 'light' | 'sensor' | 'fire' | 'hvac' | 'control' | 'access' | 'meter' | 'other';
export type DeckColor = [number, number, number, number];

export const iconMapping: Record<DeviceIcon, {
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

export const iconByDeviceType: Record<DeviceType, DeviceIcon> = {
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

const colorByIcon: Record<DeviceIcon, DeckColor> = {
  light: [255, 205, 92, 220],
  sensor: [97, 210, 199, 225],
  fire: [255, 105, 94, 235],
  hvac: [111, 171, 255, 225],
  control: [187, 157, 231, 225],
  access: [255, 156, 82, 225],
  meter: [131, 220, 147, 225],
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
