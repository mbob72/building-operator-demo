import React, { useMemo, useState } from 'react';
import {
  AlarmSeveritySchema,
  AlarmStateSchema,
  type DeviceMetadata,
} from '../../shared/domain-contracts';
import { filterAndSortAlarms, countOpenAlarms } from './alarm-model';
import { DeviceMarkerStrip } from './DeviceVisualMarkers';
import { acknowledgeAlarm } from './operator-api';
import {
  useOperatorStore,
  type AlarmSeverityFilter,
  type AlarmStateFilter,
} from './operator-store';
import { operatorRealtimeStore } from './realtime-hot-store';
import { useRealtimeSelector } from './use-realtime-state';

interface AlarmPanelProps {
  devices: DeviceMetadata[];
}

const displayTime = (value: string) => new Intl.DateTimeFormat(undefined, {
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date(value));

export const AlarmPanel = ({ devices }: AlarmPanelProps) => {
  const state = useOperatorStore();
  const alarmsById = useRealtimeSelector((snapshot) => snapshot.alarmsById);
  const statusByDeviceId = useRealtimeSelector((snapshot) => snapshot.statusByDeviceId);
  const [pendingAlarmId, setPendingAlarmId] = useState<string>();
  const [error, setError] = useState<string>();
  const deviceById = useMemo(
    () => new Map(devices.map((device) => [device.id, device])),
    [devices],
  );
  const alarms = useMemo(() => filterAndSortAlarms(alarmsById.values(), {
    severity: state.alarmSeverityFilter,
    state: state.alarmStateFilter,
  }), [alarmsById, state.alarmSeverityFilter, state.alarmStateFilter]);
  const counts = useMemo(() => countOpenAlarms(alarmsById.values()), [alarmsById]);

  if (!state.alarmPanelOpen) return null;

  const handleAcknowledge = async (alarmId: string) => {
    setPendingAlarmId(alarmId);
    setError(undefined);
    try {
      const alarm = await acknowledgeAlarm(alarmId, {
        acknowledgedBy: 'demo-operator',
        acknowledgedAt: new Date().toISOString(),
      });
      operatorRealtimeStore.upsertAlarm(alarm);
    } catch (acknowledgeError) {
      setError(acknowledgeError instanceof Error
        ? acknowledgeError.message
        : 'Alarm acknowledgement failed');
    } finally {
      setPendingAlarmId(undefined);
    }
  };

  return (
    <aside className="alarm-panel" aria-label="Alarm list" data-testid="alarm-panel">
      <header className="alarm-panel__header">
        <div>
          <p>BUILDING ALARMS</p>
          <h2>{counts.active} active · {counts.acknowledged} acknowledged</h2>
        </div>
        <button
          type="button"
          aria-label="Close alarm list"
          onClick={() => state.setAlarmPanelOpen(false)}
        >×</button>
      </header>
      <div className="alarm-panel__filters">
        <label>
          <span>Severity</span>
          <select
            value={state.alarmSeverityFilter}
            onChange={(event) => state.setAlarmSeverityFilter(
              event.target.value as AlarmSeverityFilter,
            )}
          >
            <option value="all">All severities</option>
            {AlarmSeveritySchema.options.map((severity) => (
              <option key={severity} value={severity}>{severity}</option>
            ))}
          </select>
        </label>
        <label>
          <span>State</span>
          <select
            value={state.alarmStateFilter}
            onChange={(event) => state.setAlarmStateFilter(event.target.value as AlarmStateFilter)}
          >
            <option value="all">All states</option>
            {AlarmStateSchema.options.map((alarmState) => (
              <option key={alarmState} value={alarmState}>{alarmState}</option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="alarm-panel__error" role="alert">{error}</p>}
      <div className="alarm-panel__list">
        {alarms.map((alarm) => {
          const device = deviceById.get(alarm.deviceId);
          return (
            <article
              key={alarm.id}
              className={`alarm-item alarm-item--${alarm.severity} alarm-item--${alarm.state}`}
              data-testid="alarm-row"
            >
              <div className="alarm-item__meta">
                <span>{alarm.severity}</span>
                <span>{alarm.state}</span>
                <time dateTime={alarm.updatedAt}>{displayTime(alarm.updatedAt)}</time>
              </div>
              <h3>{alarm.message}</h3>
              <p>{device?.name ?? alarm.deviceId}</p>
              {device && (
                <DeviceMarkerStrip
                  device={device}
                  status={statusByDeviceId.get(device.id) ?? 'unknown'}
                />
              )}
              {alarm.acknowledgedBy && (
                <p>Acknowledged by {alarm.acknowledgedBy} · {displayTime(alarm.acknowledgedAt!)}</p>
              )}
              <div className="alarm-item__actions">
                {device && (
                  <button
                    type="button"
                    onClick={() => state.focusDevice(device.floorId, device.id)}
                  >Locate</button>
                )}
                {alarm.state === 'active' && (
                  <button
                    type="button"
                    disabled={pendingAlarmId === alarm.id}
                    onClick={() => void handleAcknowledge(alarm.id)}
                  >{pendingAlarmId === alarm.id ? 'Acknowledging…' : 'Acknowledge'}</button>
                )}
              </div>
            </article>
          );
        })}
        {alarms.length === 0 && <p className="alarm-panel__empty">No alarms match the filters.</p>}
      </div>
    </aside>
  );
};
