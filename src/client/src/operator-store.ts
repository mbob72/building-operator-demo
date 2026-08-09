import { create } from 'zustand';
import {
  DeviceProtocolSchema,
  DeviceStatusSchema,
  DeviceTypeSchema,
  type DeviceProtocol,
  type DeviceStatus,
  type DeviceType,
  type AlarmSeverity,
  type AlarmState,
  type CommandDraft,
} from '../../shared/domain-contracts';

export type ViewMode = 'floor' | 'overview';
export type AlarmSeverityFilter = AlarmSeverity | 'all';
export type AlarmStateFilter = AlarmState | 'all';

const allDeviceTypes = () => [...DeviceTypeSchema.options];
const allDeviceProtocols = () => [...DeviceProtocolSchema.options];
const allDeviceStatuses = () => [...DeviceStatusSchema.options];

const toggleValue = <T extends string>(values: readonly T[], value: T) => (
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
);

interface OperatorState {
  viewMode: ViewMode;
  selectedFloorId: string | undefined;
  selectedDeviceId: string | undefined;
  search: string;
  typeFilters: DeviceType[];
  protocolFilters: DeviceProtocol[];
  statusFilters: DeviceStatus[];
  alarmPanelOpen: boolean;
  alarmSeverityFilter: AlarmSeverityFilter;
  alarmStateFilter: AlarmStateFilter;
  commandDraft: CommandDraft | undefined;
  setViewMode: (viewMode: ViewMode) => void;
  setSelectedFloorId: (selectedFloorId: string) => void;
  setSelectedDeviceId: (selectedDeviceId?: string) => void;
  setSearch: (search: string) => void;
  toggleTypeFilter: (type: DeviceType) => void;
  toggleProtocolFilter: (protocol: DeviceProtocol) => void;
  toggleStatusFilter: (status: DeviceStatus) => void;
  setAllTypeFilters: (selected: boolean) => void;
  setAllProtocolFilters: (selected: boolean) => void;
  setAllStatusFilters: (selected: boolean) => void;
  setAlarmPanelOpen: (alarmPanelOpen: boolean) => void;
  setAlarmSeverityFilter: (alarmSeverityFilter: AlarmSeverityFilter) => void;
  setAlarmStateFilter: (alarmStateFilter: AlarmStateFilter) => void;
  setCommandDraft: (commandDraft?: CommandDraft) => void;
  focusDevice: (floorId: string, deviceId: string) => void;
  resetFilters: () => void;
}

export const useOperatorStore = create<OperatorState>((set) => ({
  viewMode: 'floor',
  selectedFloorId: undefined,
  selectedDeviceId: undefined,
  search: '',
  typeFilters: allDeviceTypes(),
  protocolFilters: allDeviceProtocols(),
  statusFilters: allDeviceStatuses(),
  alarmPanelOpen: false,
  alarmSeverityFilter: 'all',
  alarmStateFilter: 'all',
  commandDraft: undefined,
  setViewMode: (viewMode) => set({ viewMode, selectedDeviceId: undefined, commandDraft: undefined }),
  setSelectedFloorId: (selectedFloorId) => set({
    selectedFloorId,
    selectedDeviceId: undefined,
    commandDraft: undefined,
  }),
  setSelectedDeviceId: (selectedDeviceId) => set({ selectedDeviceId, commandDraft: undefined }),
  setSearch: (search) => set({ search }),
  toggleTypeFilter: (type) => set((state) => ({
    typeFilters: toggleValue(state.typeFilters, type),
  })),
  toggleProtocolFilter: (protocol) => set((state) => ({
    protocolFilters: toggleValue(state.protocolFilters, protocol),
  })),
  toggleStatusFilter: (status) => set((state) => ({
    statusFilters: toggleValue(state.statusFilters, status),
  })),
  setAllTypeFilters: (selected) => set({ typeFilters: selected ? allDeviceTypes() : [] }),
  setAllProtocolFilters: (selected) => set({
    protocolFilters: selected ? allDeviceProtocols() : [],
  }),
  setAllStatusFilters: (selected) => set({
    statusFilters: selected ? allDeviceStatuses() : [],
  }),
  setAlarmPanelOpen: (alarmPanelOpen) => set({ alarmPanelOpen }),
  setAlarmSeverityFilter: (alarmSeverityFilter) => set({ alarmSeverityFilter }),
  setAlarmStateFilter: (alarmStateFilter) => set({ alarmStateFilter }),
  setCommandDraft: (commandDraft) => set({ commandDraft }),
  focusDevice: (selectedFloorId, selectedDeviceId) => set({
    viewMode: 'floor',
    selectedFloorId,
    selectedDeviceId,
    search: '',
    typeFilters: allDeviceTypes(),
    protocolFilters: allDeviceProtocols(),
    statusFilters: allDeviceStatuses(),
    commandDraft: undefined,
  }),
  resetFilters: () => set({
    search: '',
    typeFilters: allDeviceTypes(),
    protocolFilters: allDeviceProtocols(),
    statusFilters: allDeviceStatuses(),
  }),
}));
