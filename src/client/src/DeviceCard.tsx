import { useMemo } from 'react';
import type { DeviceMetadata } from '../../shared/domain-contracts';
import type { FloorSummary } from '../../shared/scene-contracts';
import { filterAndSortAlarms } from './alarm-model';
import { DeviceMarkerStrip } from './DeviceVisualMarkers';
import { CommandControls } from './CommandControls';
import { useDeviceTelemetry, useRealtimeSelector } from './use-realtime-state';

interface DeviceCardProps {
  device: DeviceMetadata;
  floors: FloorSummary[];
  onClose: () => void;
}

const formatValue = (value: boolean | number | string | null): string => {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(1);
  return value;
};

export const DeviceCard = ({ device, floors, onClose }: DeviceCardProps) => {
  const telemetry = useDeviceTelemetry(device.id);
  const alarmsById = useRealtimeSelector((snapshot) => snapshot.alarmsById);
  const commandsById = useRealtimeSelector((snapshot) => snapshot.commandsById);
  const floorName = floors.find((floor) => floor.id === device.floorId)?.name ?? device.floorId;
  const channels = Object.entries(telemetry?.values ?? {}).slice(0, 4);
  const alarms = useMemo(() => filterAndSortAlarms(
    [...alarmsById.values()].filter((alarm) => alarm.deviceId === device.id),
    { severity: 'all', state: 'all' },
  ), [alarmsById, device.id]);
  const commands = useMemo(() => [...commandsById.values()].filter(
    (command) => command.deviceId === device.id,
  ), [commandsById, device.id]);

  return (
    <aside className="device-card" aria-label="Selected device">
      <button
        type="button"
        className="device-card__close"
        onClick={onClose}
        aria-label="Close device card"
      >×</button>
      <p className="device-card__eyebrow">SELECTED DEVICE</p>
      <h2>{device.name}</h2>
      <div className={`device-card__status device-card__status--${telemetry?.status ?? 'unknown'}`}>
        {telemetry?.status ?? 'unknown'} · {telemetry?.connection ?? 'unknown'}
      </div>
      <DeviceMarkerStrip device={device} status={telemetry?.status ?? 'unknown'} />
      <dl>
        <div><dt>Floor</dt><dd>{floorName.replace('West Riverside Hospital · ', '')}</dd></div>
        <div><dt>Type</dt><dd>{device.type}</dd></div>
        <div><dt>Protocol</dt><dd>{device.protocol}</dd></div>
        <div><dt>Origin</dt><dd>{device.dataOrigin}</dd></div>
        <div><dt>Position</dt><dd>{device.position.x.toFixed(2)}, {device.position.y.toFixed(2)}</dd></div>
      </dl>
      {channels.length > 0 && (
        <div className="device-card__telemetry">
          <p>LIVE VALUES</p>
          <dl>
            {channels.map(([key, value]) => (
              <div key={key}><dt>{key}</dt><dd>{formatValue(value)}</dd></div>
            ))}
          </dl>
        </div>
      )}
      {alarms.length > 0 && (
        <div className="device-card__alarms">
          <p>ALARMS</p>
          {alarms.map((alarm) => (
            <div key={alarm.id} className={`device-card__alarm device-card__alarm--${alarm.state}`}>
              <strong>{alarm.severity} · {alarm.state}</strong>
              <span>{alarm.message}</span>
              {alarm.acknowledgedBy && <small>by {alarm.acknowledgedBy}</small>}
            </div>
          ))}
        </div>
      )}
      <CommandControls device={device} telemetry={telemetry} commands={commands} />
      <p className="device-card__id">{device.id}</p>
    </aside>
  );
};
