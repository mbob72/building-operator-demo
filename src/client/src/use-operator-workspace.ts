import { useEffect, useMemo } from 'react';
import type { FloorSummary } from '../../shared/scene-contracts';
import { filterDevices } from './operator-devices';
import { useDeviceCatalogQuery } from './operator-queries';
import { useOperatorStore } from './operator-store';
import { useRealtimeBootstrap, useRealtimeSelector } from './use-realtime-state';

export const useOperatorWorkspaceModel = (floors: FloorSummary[]) => {
  const state = useOperatorStore();
  const selectedFloor = floors.find((floor) => floor.id === state.selectedFloorId) ?? floors[0];
  const floorIds = state.viewMode === 'floor' && selectedFloor ? [selectedFloor.id] : undefined;
  const catalogQuery = useDeviceCatalogQuery(floorIds, Boolean(selectedFloor));
  useRealtimeBootstrap(Boolean(selectedFloor));
  const ready = useRealtimeSelector((snapshot) => snapshot.ready);
  const realtimeError = useRealtimeSelector((snapshot) => snapshot.error);
  const statusByDeviceId = useRealtimeSelector((snapshot) => snapshot.statusByDeviceId);
  const dirtyStatusDeviceIds = useRealtimeSelector((snapshot) => snapshot.dirtyStatusDeviceIds);
  const statusVersion = useRealtimeSelector((snapshot) => snapshot.statusVersion);
  const priorityMembershipVersion = useRealtimeSelector(
    (snapshot) => snapshot.priorityMembershipVersion,
  );
  const priorityMembershipChanged = useRealtimeSelector(
    (snapshot) => snapshot.priorityMembershipChanged,
  );

  useEffect(() => {
    if (!state.selectedFloorId && floors[0]) state.setSelectedFloorId(floors[0].id);
  }, [floors, state.selectedFloorId, state.setSelectedFloorId]);

  const devices = catalogQuery.data?.devices ?? [];
  const statusFilterDependency = state.statusFilter === 'all' ? undefined : statusVersion;
  const filteredDevices = useMemo(() => filterDevices(devices, statusByDeviceId, {
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
    statusFilterDependency,
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
    selectedDevice,
    onSelectDevice: state.setSelectedDeviceId,
    requestError: catalogQuery.error ?? realtimeError,
    isLoading: catalogQuery.isLoading || !ready,
    statusByDeviceId,
    dirtyStatusDeviceIds,
    statusVersion,
    priorityMembershipVersion,
    priorityMembershipChanged,
  };
};
