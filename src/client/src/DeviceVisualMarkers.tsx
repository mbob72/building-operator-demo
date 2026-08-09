import React from 'react';
import type {
  DeviceMetadata,
  DeviceProtocol,
  DeviceStatus,
  DeviceType,
} from '../../shared/domain-contracts';
import { deviceIconOrder, iconByDeviceType } from './device-visuals';

const markerIconSize = 16;

const protocolLabel: Record<DeviceProtocol, string> = {
  dali: 'DALI',
  knx: 'KNX',
  modbus: 'MB',
  bacnet: 'BAC',
  'fire-alarm': 'FIRE',
  security: 'SEC',
  'access-control': 'AC',
  virtual: 'VRT',
  other: 'ETC',
};

export const DeviceTypeIcon = ({ type }: { type: DeviceType }) => {
  const iconIndex = deviceIconOrder.indexOf(iconByDeviceType[type]);
  return (
    <span
      className="device-type-icon"
      data-device-type={type}
      style={{
        backgroundPosition: `${-iconIndex * markerIconSize}px 0`,
        backgroundSize: `${deviceIconOrder.length * markerIconSize}px ${markerIconSize}px`,
      }}
      aria-hidden="true"
    />
  );
};

export const DeviceStatusSquare = ({ status }: { status: DeviceStatus }) => (
  <span className={`device-status-square device-status-square--${status}`} aria-hidden="true" />
);

export const DeviceProtocolBadge = ({ protocol }: { protocol: DeviceProtocol }) => (
  <span className={`device-protocol-badge device-protocol-badge--${protocol}`} aria-hidden="true">
    {protocolLabel[protocol]}
  </span>
);

interface DeviceMarkerStripProps {
  device: DeviceMetadata;
  status: DeviceStatus;
}

export const DeviceMarkerStrip = ({ device, status }: DeviceMarkerStripProps) => (
  <div className="device-marker-strip" aria-label="Device type, protocol, and status">
    <span className="device-marker-strip__item">
      <DeviceTypeIcon type={device.type} />
      <span>{device.type.replaceAll('-', ' ')}</span>
    </span>
    <span className="device-marker-strip__item">
      <DeviceProtocolBadge protocol={device.protocol} />
      <span>{device.protocol.replaceAll('-', ' ')}</span>
    </span>
    <span className="device-marker-strip__item">
      <DeviceStatusSquare status={status} />
      <span>{status}</span>
    </span>
  </div>
);
