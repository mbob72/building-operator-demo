import type { DeviceMetadata, DeviceStatus } from '../../shared/domain-contracts';
import type { DeviceProtocol, DeviceType } from '../../shared/domain-contracts';

export interface DeviceFilters {
  search: string;
  types: readonly DeviceType[];
  protocols: readonly DeviceProtocol[];
  statuses: readonly DeviceStatus[];
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
  const types = new Set(filters.types);
  const protocols = new Set(filters.protocols);
  const statuses = new Set(filters.statuses);
  return devices.filter((device) => {
    return matchesSearch(device, normalizedSearch)
      && types.has(device.type)
      && protocols.has(device.protocol)
      && statuses.has(statusByDeviceId.get(device.id) ?? 'unknown');
  });
};
