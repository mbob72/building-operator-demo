import {
  DeviceProtocolSchema,
  DeviceStatusSchema,
  DeviceTypeSchema,
} from '../../shared/domain-contracts';
import type { FloorSummary } from '../../shared/scene-contracts';
import {
  useOperatorStore,
  type DeviceProtocolFilter,
  type DeviceStatusFilter,
  type DeviceTypeFilter,
} from './operator-store';

interface OperatorToolbarProps {
  floors: FloorSummary[];
  visibleDevices: number;
  totalDevices: number;
}

export const OperatorToolbar = ({ floors, visibleDevices, totalDevices }: OperatorToolbarProps) => {
  const state = useOperatorStore();

  return (
    <div className="operator-toolbar" aria-label="Scene controls">
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

      <label>
        <span>Type</span>
        <select
          value={state.typeFilter}
          onChange={(event) => state.setTypeFilter(event.target.value as DeviceTypeFilter)}
        >
          <option value="all">All types</option>
          {DeviceTypeSchema.options.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </label>

      <label>
        <span>Protocol</span>
        <select
          value={state.protocolFilter}
          onChange={(event) => state.setProtocolFilter(event.target.value as DeviceProtocolFilter)}
        >
          <option value="all">All protocols</option>
          {DeviceProtocolSchema.options.map((protocol) => (
            <option key={protocol} value={protocol}>{protocol}</option>
          ))}
        </select>
      </label>

      <label>
        <span>Status</span>
        <select
          value={state.statusFilter}
          onChange={(event) => state.setStatusFilter(event.target.value as DeviceStatusFilter)}
        >
          <option value="all">All states</option>
          {DeviceStatusSchema.options.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </label>

      <button type="button" className="operator-toolbar__reset" onClick={state.resetFilters}>Reset</button>
      <output className="operator-toolbar__count">{visibleDevices.toLocaleString()} / {totalDevices.toLocaleString()}</output>
    </div>
  );
};
