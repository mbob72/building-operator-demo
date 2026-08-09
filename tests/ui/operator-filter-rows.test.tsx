// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OperatorFilterRows } from '../../src/client/src/OperatorFilterRows';
import { OperatorToolbar } from '../../src/client/src/OperatorToolbar';
import { useOperatorStore } from '../../src/client/src/operator-store';
import {
  DeviceProtocolSchema,
  DeviceStatusSchema,
  DeviceTypeSchema,
} from '../../src/shared/domain-contracts';

beforeEach(() => {
  useOperatorStore.setState({
    typeFilters: [...DeviceTypeSchema.options],
    protocolFilters: [...DeviceProtocolSchema.options],
    statusFilters: [...DeviceStatusSchema.options],
    alarmPanelOpen: false,
  });
});

afterEach(cleanup);

describe('operator multi-select filters', () => {
  it('exposes checked, unchecked, and indeterminate master states', () => {
    render(<OperatorFilterRows />);
    const allStatuses = screen.getByRole('checkbox', { name: 'All statuses' });

    expect(allStatuses).toBeChecked();
    expect(allStatuses).not.toBePartiallyChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'warning' }));
    expect(allStatuses).not.toBeChecked();
    expect(allStatuses).toBePartiallyChecked();
    expect(useOperatorStore.getState().statusFilters).not.toContain('warning');

    fireEvent.click(allStatuses);
    expect(allStatuses).toBeChecked();
    expect(useOperatorStore.getState().statusFilters).toEqual(DeviceStatusSchema.options);
    fireEvent.click(allStatuses);
    expect(useOperatorStore.getState().statusFilters).toEqual([]);
  });

  it('shows semantic status, protocol, and device-type markers', () => {
    const { container } = render(<OperatorFilterRows />);

    expect(screen.getByRole('checkbox', { name: 'critical' }).parentElement
      ?.querySelector('.device-status-square--critical')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'bacnet' }).parentElement
      ?.querySelector('.device-protocol-badge--bacnet')).toHaveTextContent('BAC');
    expect(screen.getByRole('checkbox', { name: 'light' }).parentElement
      ?.querySelector('.device-type-icon')).toBeInTheDocument();
    const typeIcons = [...container.querySelectorAll<HTMLElement>('.device-type-icon')];
    expect(typeIcons).toHaveLength(DeviceTypeSchema.options.length);
    expect(new Set(typeIcons.map((icon) => icon.style.backgroundPosition)).size)
      .toBe(DeviceTypeSchema.options.length);
    expect(typeIcons.map((icon) => icon.dataset.deviceType)).toEqual(DeviceTypeSchema.options);
  });

  it('places the alarm action before other toolbar controls', () => {
    render(<OperatorToolbar floors={[]} visibleDevices={0} totalDevices={0} />);

    const primaryButtons = screen.getByLabelText('Scene controls')
      .querySelectorAll('.operator-toolbar__primary button');
    expect(primaryButtons[0]).toHaveTextContent('Alarms');
  });
});
