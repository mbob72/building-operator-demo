import React, { useEffect, useRef, type ReactNode } from 'react';
import {
  DeviceProtocolSchema,
  DeviceStatusSchema,
  DeviceTypeSchema,
  type DeviceProtocol,
  type DeviceStatus,
  type DeviceType,
} from '../../shared/domain-contracts';
import {
  DeviceProtocolBadge,
  DeviceStatusSquare,
  DeviceTypeIcon,
} from './DeviceVisualMarkers';
import { useOperatorStore } from './operator-store';

interface MasterCheckboxProps {
  label: string;
  selectedCount: number;
  totalCount: number;
  onToggle: (selected: boolean) => void;
}

const MasterCheckbox = ({
  label,
  selectedCount,
  totalCount,
  onToggle,
}: MasterCheckboxProps) => {
  const ref = useRef<HTMLInputElement>(null);
  const allSelected = selectedCount === totalCount;
  const partiallySelected = selectedCount > 0 && !allSelected;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partiallySelected;
  }, [partiallySelected]);

  return (
    <label className="operator-filter__option operator-filter__master">
      <input
        ref={ref}
        type="checkbox"
        checked={allSelected}
        aria-checked={partiallySelected ? 'mixed' : allSelected}
        onChange={() => onToggle(!allSelected)}
      />
      <span>{label}</span>
    </label>
  );
};

interface FilterRowProps<T extends string> {
  label: string;
  allLabel: string;
  options: readonly T[];
  selected: readonly T[];
  onToggle: (option: T) => void;
  onToggleAll: (selected: boolean) => void;
  marker: (option: T) => ReactNode;
}

const FilterRow = <T extends string>({
  label,
  allLabel,
  options,
  selected,
  onToggle,
  onToggleAll,
  marker,
}: FilterRowProps<T>) => (
  <div className="operator-filter-row" role="group" aria-label={label}>
    <span className="operator-filter-row__label">{label}</span>
    <div className="operator-filter-row__options">
      <MasterCheckbox
        label={allLabel}
        selectedCount={selected.length}
        totalCount={options.length}
        onToggle={onToggleAll}
      />
      {options.map((option) => (
        <label key={option} className="operator-filter__option">
          <input
            type="checkbox"
            checked={selected.includes(option)}
            onChange={() => onToggle(option)}
          />
          {marker(option)}
          <span>{option.replaceAll('-', ' ')}</span>
        </label>
      ))}
    </div>
  </div>
);

export const OperatorFilterRows = () => {
  const state = useOperatorStore();

  return (
    <div className="operator-toolbar__filters" aria-label="Device filters">
      <FilterRow
        label="Status"
        allLabel="All statuses"
        options={DeviceStatusSchema.options}
        selected={state.statusFilters}
        onToggle={state.toggleStatusFilter}
        onToggleAll={state.setAllStatusFilters}
        marker={(status) => <DeviceStatusSquare status={status} />}
      />
      <FilterRow
        label="Protocol"
        allLabel="All protocols"
        options={DeviceProtocolSchema.options}
        selected={state.protocolFilters}
        onToggle={state.toggleProtocolFilter}
        onToggleAll={state.setAllProtocolFilters}
        marker={(protocol) => <DeviceProtocolBadge protocol={protocol} />}
      />
      <FilterRow
        label="Type"
        allLabel="All types"
        options={DeviceTypeSchema.options}
        selected={state.typeFilters}
        onToggle={state.toggleTypeFilter}
        onToggleAll={state.setAllTypeFilters}
        marker={(type) => <DeviceTypeIcon type={type} />}
      />
    </div>
  );
};
