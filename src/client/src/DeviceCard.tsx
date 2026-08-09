import type { DeviceMetadata, DeviceTelemetry } from '../../shared/domain-contracts';
import type { FloorSummary } from '../../shared/scene-contracts';

interface DeviceCardProps {
  device: DeviceMetadata;
  telemetry: DeviceTelemetry | undefined;
  floors: FloorSummary[];
  onClose: () => void;
}

const formatValue = (value: boolean | number | string | null): string => {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(1);
  return value;
};

export const DeviceCard = ({ device, telemetry, floors, onClose }: DeviceCardProps) => {
  const floorName = floors.find((floor) => floor.id === device.floorId)?.name ?? device.floorId;
  const channels = Object.entries(telemetry?.values ?? {}).slice(0, 4);

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
      <dl>
        <div><dt>Floor</dt><dd>{floorName.replace('West Riverside Hospital · ', '')}</dd></div>
        <div><dt>Type</dt><dd>{device.type}</dd></div>
        <div><dt>Protocol</dt><dd>{device.protocol}</dd></div>
        <div><dt>Origin</dt><dd>{device.dataOrigin}</dd></div>
        <div><dt>Position</dt><dd>{device.position.x.toFixed(2)}, {device.position.y.toFixed(2)}</dd></div>
      </dl>
      {channels.length > 0 && (
        <div className="device-card__telemetry">
          <p>SNAPSHOT VALUES</p>
          <dl>
            {channels.map(([key, value]) => (
              <div key={key}><dt>{key}</dt><dd>{formatValue(value)}</dd></div>
            ))}
          </dl>
        </div>
      )}
      <p className="device-card__id">{device.id}</p>
    </aside>
  );
};
