import type { DeviceMetadata, DeviceStatus } from '../../shared/domain-contracts';
import type {
  DeviceProtocolFilter,
  DeviceStatusFilter,
  DeviceTypeFilter,
} from './operator-store';

export interface DeviceFilters {
  search: string;
  type: DeviceTypeFilter;
  protocol: DeviceProtocolFilter;
  status: DeviceStatusFilter;
}

const matchesSearch = (device: DeviceMetadata, normalizedSearch: string) => (
  normalizedSearch.length === 0
  || device.name.toLocaleLowerCase().includes(normalizedSearch)
  || device.id.toLocaleLowerCase().includes(normalizedSearch)
);

export const filterDevices = (
  devices: readonly DeviceMetadata[],
  statusByDeviceId: ReadonlyMap<string, DeviceStatus>,
  filters: DeviceFilters,
) => {
  const normalizedSearch = filters.search.trim().toLocaleLowerCase();
  return devices.filter((device) => {
    return matchesSearch(device, normalizedSearch)
      && (filters.type === 'all' || device.type === filters.type)
      && (filters.protocol === 'all' || device.protocol === filters.protocol)
      && (filters.status === 'all' || statusByDeviceId.get(device.id) === filters.status);
  });
};
