import { useEffect, useMemo } from 'react';
import type { FloorSummary } from '../../shared/scene-contracts';
import { DeviceStatusSchema } from '../../shared/domain-contracts';
import { filterDevices } from './operator-devices';
import { useDeviceCatalogQuery } from './operator-queries';
import { useOperatorStore } from './operator-store';
import { useRealtimeBootstrap, useRealtimeSelector } from './use-realtime-state';

export const useOperatorWorkspaceModel = (floors: FloorSummary[]) => {
  const state = useOperatorStore();
  const selectedFloor = floors.find((floor) => floor.id === state.selectedFloorId) ?? floors[0];
  const catalogQuery = useDeviceCatalogQuery(undefined, Boolean(selectedFloor));
  useRealtimeBootstrap(Boolean(selectedFloor));
  const ready = useRealtimeSelector((snapshot) => snapshot.ready);
  const realtimeError = useRealtimeSelector((snapshot) => snapshot.error);
  const statusByDeviceId = useRealtimeSelector((snapshot) => snapshot.statusByDeviceId);
  const dirtyStatusDeviceIds = useRealtimeSelector((snapshot) => snapshot.dirtyStatusDeviceIds);
  const statusVersion = useRealtimeSelector((snapshot) => snapshot.statusVersion);
  const priorityMembershipVersion = useRealtimeSelector(
    (snapshot) => snapshot.priorityMembershipVersion,
  );
  const alarmsById = useRealtimeSelector((snapshot) => snapshot.alarmsById);

  useEffect(() => {
    if (!state.selectedFloorId && floors[0]) state.setSelectedFloorId(floors[0].id);
  }, [floors, state.selectedFloorId, state.setSelectedFloorId]);

  const catalogDevices = catalogQuery.data?.devices ?? [];
  const devices = useMemo(() => (
    state.viewMode === 'floor' && selectedFloor
      ? catalogDevices.filter((device) => device.floorId === selectedFloor.id)
      : catalogDevices
  ), [catalogDevices, selectedFloor, state.viewMode]);
  const statusFilterDependency = state.statusFilters.length === DeviceStatusSchema.options.length
    ? undefined
    : statusVersion;
  const filteredDevices = useMemo(() => filterDevices(devices, statusByDeviceId, {
    search: state.search,
    types: state.typeFilters,
    protocols: state.protocolFilters,
    statuses: state.statusFilters,
  }), [
    devices,
    state.search,
    state.protocolFilters,
    state.statusFilters,
    state.typeFilters,
    statusFilterDependency,
  ]);
  const visibleDeviceIds = useMemo(
    () => new Set(filteredDevices.map((device) => device.id)),
    [filteredDevices],
  );

  const selectedDevice = useMemo(
    () => catalogDevices.find((device) => device.id === state.selectedDeviceId),
    [catalogDevices, state.selectedDeviceId],
  );

  return {
    viewMode: state.viewMode,
    selectedFloor,
    catalogDevices,
    devices,
    filteredDevices,
    visibleDeviceIds,
    selectedDevice,
    onSelectDevice: state.setSelectedDeviceId,
    requestError: catalogQuery.error ?? realtimeError,
    isLoading: catalogQuery.isLoading || !ready,
    statusByDeviceId,
    dirtyStatusDeviceIds,
    statusVersion,
    priorityMembershipVersion,
    alarmsById,
  };
};
