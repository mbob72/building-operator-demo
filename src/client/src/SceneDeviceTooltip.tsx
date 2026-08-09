import React from 'react';
import type { DeviceMetadata, DeviceStatus } from '../../shared/domain-contracts';
import type { ElementSize } from './use-element-size';

export interface HoveredDevice {
  device: DeviceMetadata;
  x: number;
  y: number;
}

interface SceneDeviceTooltipProps {
  hovered: HoveredDevice | undefined;
  status: DeviceStatus | undefined;
  floorName: string | undefined;
  size: ElementSize;
}

export const SceneDeviceTooltip = ({
  hovered,
  status,
  floorName,
  size,
}: SceneDeviceTooltipProps) => {
  if (!hovered) return null;
  const left = Math.max(10, Math.min(hovered.x + 14, size.width - 230));
  const top = Math.max(10, Math.min(hovered.y + 14, size.height - 108));

  return (
    <div
      className="scene-device-tooltip"
      role="tooltip"
      style={{ left, top }}
      data-testid="scene-device-tooltip"
    >
      <strong>{hovered.device.name}</strong>
      <span>{hovered.device.type} · {status ?? 'unknown'}</span>
      <span>{floorName ?? hovered.device.floorId}</span>
    </div>
  );
};
