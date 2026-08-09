import { useEffect, useMemo } from 'react';
import type { DeviceMetadata, DeviceTelemetry } from '../../shared/domain-contracts';
import type { FloorSummary } from '../../shared/scene-contracts';
import { BuildingOverview } from './BuildingOverview';
import { FloorScene } from './FloorScene';
import { OperatorToolbar } from './OperatorToolbar';
import { useDeviceCatalogQuery, useStateSnapshotQuery } from './operator-queries';
import { useOperatorStore } from './operator-store';

interface OperatorWorkspaceProps {
  floors: FloorSummary[];
}

const matchesSearch = (device: DeviceMetadata, normalizedSearch: string) => (
  normalizedSearch.length === 0
  || device.name.toLocaleLowerCase().includes(normalizedSearch)
  || device.id.toLocaleLowerCase().includes(normalizedSearch)
);

export const OperatorWorkspace = ({ floors }: OperatorWorkspaceProps) => {
  const state = useOperatorStore();
  const selectedFloor = floors.find((floor) => floor.id === state.selectedFloorId) ?? floors[0];
  const floorIds = state.viewMode === 'floor' && selectedFloor ? [selectedFloor.id] : undefined;
  const catalogQuery = useDeviceCatalogQuery(floorIds, Boolean(selectedFloor));
  const snapshotQuery = useStateSnapshotQuery(floorIds, Boolean(selectedFloor));

  useEffect(() => {
    if (!state.selectedFloorId && floors[0]) state.setSelectedFloorId(floors[0].id);
  }, [floors, state.selectedFloorId, state.setSelectedFloorId]);

  const telemetryByDeviceId = useMemo(() => new Map<string, DeviceTelemetry>(
    snapshotQuery.data?.telemetry.map((telemetry) => [telemetry.deviceId, telemetry]) ?? [],
  ), [snapshotQuery.data]);

  const devices = catalogQuery.data?.devices ?? [];
  const normalizedSearch = state.search.trim().toLocaleLowerCase();
  const filteredDevices = useMemo(() => devices.filter((device) => {
    const telemetry = telemetryByDeviceId.get(device.id);
    return matchesSearch(device, normalizedSearch)
      && (state.typeFilter === 'all' || device.type === state.typeFilter)
      && (state.protocolFilter === 'all' || device.protocol === state.protocolFilter)
      && (state.statusFilter === 'all' || telemetry?.status === state.statusFilter);
  }), [
    devices,
    normalizedSearch,
    state.protocolFilter,
    state.statusFilter,
    state.typeFilter,
    telemetryByDeviceId,
  ]);

  const selectedDevice = devices.find((device) => device.id === state.selectedDeviceId);
  const requestError = catalogQuery.error ?? snapshotQuery.error;
  const isLoading = catalogQuery.isLoading || snapshotQuery.isLoading;

  return (
    <>
      <OperatorToolbar
        floors={floors}
        visibleDevices={filteredDevices.length}
        totalDevices={devices.length}
      />
      <div className="operator-workspace__scene">
        {requestError && (
          <div className="workspace-state workspace-state--error">
            {requestError instanceof Error ? requestError.message : 'Operator data request failed'}
          </div>
        )}
        {!requestError && isLoading && (
          <div className="workspace-state">Loading device catalog and status snapshot…</div>
        )}
        {!requestError && !isLoading && selectedFloor && state.viewMode === 'floor' && (
          <FloorScene
            floor={selectedFloor}
            floors={floors}
            devices={filteredDevices}
            telemetryByDeviceId={telemetryByDeviceId}
            selectedDevice={selectedDevice}
            onSelectDevice={state.setSelectedDeviceId}
          />
        )}
        {!requestError && !isLoading && state.viewMode === 'overview' && (
          <BuildingOverview
            floors={floors}
            devices={filteredDevices}
            telemetryByDeviceId={telemetryByDeviceId}
            selectedDevice={selectedDevice}
            onSelectDevice={state.setSelectedDeviceId}
          />
        )}
      </div>
    </>
  );
};
