import { useEffect, useMemo } from 'react';
import type { DeviceTelemetry } from '../../shared/domain-contracts';
import type { FloorSummary } from '../../shared/scene-contracts';
import { filterDevices } from './operator-devices';
import { useDeviceCatalogQuery, useStateSnapshotQuery } from './operator-queries';
import { useOperatorStore } from './operator-store';

export const useOperatorWorkspaceModel = (floors: FloorSummary[]) => {
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
  const filteredDevices = useMemo(() => filterDevices(devices, telemetryByDeviceId, {
    search: state.search,
    type: state.typeFilter,
    protocol: state.protocolFilter,
    status: state.statusFilter,
  }), [
    devices,
    state.search,
    state.protocolFilter,
    state.statusFilter,
    state.typeFilter,
    telemetryByDeviceId,
  ]);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === state.selectedDeviceId),
    [devices, state.selectedDeviceId],
  );

  return {
    viewMode: state.viewMode,
    selectedFloor,
    devices,
    filteredDevices,
    telemetryByDeviceId,
    selectedDevice,
    onSelectDevice: state.setSelectedDeviceId,
    requestError: catalogQuery.error ?? snapshotQuery.error,
    isLoading: catalogQuery.isLoading || snapshotQuery.isLoading,
  };
};
