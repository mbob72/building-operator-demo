import { create } from 'zustand';
import type {
  DeviceProtocol,
  DeviceStatus,
  DeviceType,
} from '../../shared/domain-contracts';

export type ViewMode = 'floor' | 'overview';
export type DeviceTypeFilter = DeviceType | 'all';
export type DeviceProtocolFilter = DeviceProtocol | 'all';
export type DeviceStatusFilter = DeviceStatus | 'all';

interface OperatorState {
  viewMode: ViewMode;
  selectedFloorId: string | undefined;
  selectedDeviceId: string | undefined;
  search: string;
  typeFilter: DeviceTypeFilter;
  protocolFilter: DeviceProtocolFilter;
  statusFilter: DeviceStatusFilter;
  setViewMode: (viewMode: ViewMode) => void;
  setSelectedFloorId: (selectedFloorId: string) => void;
  setSelectedDeviceId: (selectedDeviceId?: string) => void;
  setSearch: (search: string) => void;
  setTypeFilter: (typeFilter: DeviceTypeFilter) => void;
  setProtocolFilter: (protocolFilter: DeviceProtocolFilter) => void;
  setStatusFilter: (statusFilter: DeviceStatusFilter) => void;
  resetFilters: () => void;
}

export const useOperatorStore = create<OperatorState>((set) => ({
  viewMode: 'floor',
  selectedFloorId: undefined,
  selectedDeviceId: undefined,
  search: '',
  typeFilter: 'all',
  protocolFilter: 'all',
  statusFilter: 'all',
  setViewMode: (viewMode) => set({ viewMode, selectedDeviceId: undefined }),
  setSelectedFloorId: (selectedFloorId) => set({ selectedFloorId, selectedDeviceId: undefined }),
  setSelectedDeviceId: (selectedDeviceId) => set({ selectedDeviceId }),
  setSearch: (search) => set({ search }),
  setTypeFilter: (typeFilter) => set({ typeFilter }),
  setProtocolFilter: (protocolFilter) => set({ protocolFilter }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  resetFilters: () => set({
    search: '',
    typeFilter: 'all',
    protocolFilter: 'all',
    statusFilter: 'all',
  }),
}));
