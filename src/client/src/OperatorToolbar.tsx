import React from 'react';
import type { FloorSummary } from '../../shared/scene-contracts';
import { OperatorFilterRows } from './OperatorFilterRows';
import { useOperatorStore } from './operator-store';
import { countOpenAlarms } from './alarm-model';
import { useRealtimeSelector } from './use-realtime-state';

interface OperatorToolbarProps {
  floors: FloorSummary[];
  visibleDevices: number;
  totalDevices: number;
}

export const OperatorToolbar = ({
  floors,
  visibleDevices,
  totalDevices,
}: OperatorToolbarProps) => {
  const state = useOperatorStore();
  const connectionStatus = useRealtimeSelector((snapshot) => snapshot.connectionStatus);
  const realtimeSequence = useRealtimeSelector((snapshot) => snapshot.sequence);
  const alarmsById = useRealtimeSelector((snapshot) => snapshot.alarmsById);
  const alarmCounts = countOpenAlarms(alarmsById.values());

  return (
    <div className="operator-toolbar" aria-label="Scene controls">
      <div className="operator-toolbar__primary">
        <button
          type="button"
          className={`operator-toolbar__alarms ${state.alarmPanelOpen ? 'is-active' : ''}`}
          aria-expanded={state.alarmPanelOpen}
          onClick={() => state.setAlarmPanelOpen(!state.alarmPanelOpen)}
        >Alarms <strong>{alarmCounts.active}</strong></button>

        <div className="mode-switch" aria-label="View mode">
          <button
            type="button"
            className={state.viewMode === 'floor' ? 'is-active' : ''}
            aria-pressed={state.viewMode === 'floor'}
            onClick={() => state.setViewMode('floor')}
          >Floor</button>
          <button
            type="button"
            className={state.viewMode === 'overview' ? 'is-active' : ''}
            aria-pressed={state.viewMode === 'overview'}
            onClick={() => state.setViewMode('overview')}
          >Building</button>
        </div>

        <label>
          <span>Floor</span>
          <select
            value={state.selectedFloorId ?? ''}
            onChange={(event) => state.setSelectedFloorId(event.target.value)}
          >
            {floors.map((floor) => (
              <option key={floor.id} value={floor.id}>
                {floor.name.replace('West Riverside Hospital · ', '')}
              </option>
            ))}
          </select>
        </label>

        <label className="operator-toolbar__search">
          <span>Search</span>
          <input
            type="search"
            value={state.search}
            placeholder="Name or ID"
            onChange={(event) => state.setSearch(event.target.value)}
          />
        </label>

        <button type="button" className="operator-toolbar__reset" onClick={state.resetFilters}>Reset</button>
        <output
          className={`operator-toolbar__realtime operator-toolbar__realtime--${connectionStatus}`}
          data-testid="realtime-status"
          title={`Applied realtime sequence ${realtimeSequence}`}
        >{connectionStatus} · #{realtimeSequence}</output>
        <output className="operator-toolbar__count">{visibleDevices.toLocaleString()} / {totalDevices.toLocaleString()}</output>
      </div>
      <OperatorFilterRows />
    </div>
  );
};
