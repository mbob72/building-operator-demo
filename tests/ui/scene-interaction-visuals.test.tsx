// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SceneDeviceTooltip } from '../../src/client/src/SceneDeviceTooltip';
import { createSelectionIndicatorLayer } from '../../src/client/src/selection-layers';
import { makeDevice } from './device-fixtures';

describe('scene interaction visuals', () => {
  it('shows one clamped, multi-line tooltip for the hovered device', () => {
    const device = makeDevice('hovered', { type: 'smoke-detector' });
    render(<SceneDeviceTooltip
      hovered={{ device, x: 290, y: 190 }}
      status="critical"
      floorName="Level 1"
      size={{ width: 300, height: 200 }}
    />);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Device hovered');
    expect(tooltip).toHaveTextContent('smoke-detector · critical');
    expect(tooltip).toHaveTextContent('Level 1');
    expect(tooltip).toHaveStyle({ left: '70px', top: '92px' });
  });

  it('creates a fixed-size, non-pickable halo for the current selection', () => {
    const selected = makeDevice('selected');
    const layer = createSelectionIndicatorLayer({
      id: 'selected-device',
      data: [selected],
      getPosition: (device) => [device.position.x, device.position.y],
    });

    expect(layer.props.data).toEqual([selected]);
    expect(layer.props.pickable).toBe(false);
    expect(layer.props.radiusMinPixels).toBe(17);
    expect(layer.props.radiusMaxPixels).toBe(17);
    expect(layer.props.getLineColor).toEqual([238, 255, 253, 255]);
    expect(layer.props.getLineWidth).toBe(3);
  });
});
