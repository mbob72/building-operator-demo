import { describe, expect, it } from 'vitest';
import {
  MAX_FLOOR_DEVICE_LABELS,
  PRIORITY_LABEL_MIN_ZOOM,
  VISIBLE_DEVICE_LABEL_MIN_ZOOM,
} from '../../src/client/src/floor-scene-config';
import { selectFloorDeviceLabels } from '../../src/client/src/floor-scene-labels';
import type { SceneViewState } from '../../src/client/src/viewport';
import { makeDevice } from './device-fixtures';

const viewState = (zoom: number): SceneViewState => ({
  target: [10, 10, 0],
  zoom,
  minZoom: -1,
  maxZoom: 7,
});

const baseOptions = {
  floorId: 'floor-1',
  size: { width: 1_000, height: 800 },
  devices: [],
  priorityDevices: [],
  selectedDevice: undefined,
};

describe('floor device label LOD', () => {
  it('keeps the selected device labeled at every zoom on its own floor', () => {
    const selected = makeDevice('selected');

    expect(selectFloorDeviceLabels({
      ...baseOptions,
      viewState: viewState(-1),
      selectedDevice: selected,
    })).toEqual([selected]);
    expect(selectFloorDeviceLabels({
      ...baseOptions,
      viewState: viewState(-1),
      selectedDevice: makeDevice('other-floor', { floorId: 'floor-2' }),
    })).toEqual([]);
  });

  it('adds priority labels exactly at the priority zoom threshold', () => {
    const priority = makeDevice('priority');

    expect(selectFloorDeviceLabels({
      ...baseOptions,
      viewState: viewState(PRIORITY_LABEL_MIN_ZOOM - 0.01),
      priorityDevices: [priority],
    })).toEqual([]);
    expect(selectFloorDeviceLabels({
      ...baseOptions,
      viewState: viewState(PRIORITY_LABEL_MIN_ZOOM),
      priorityDevices: [priority],
    })).toEqual([priority]);
  });

  it('adds only viewport devices at the detailed label threshold', () => {
    const visible = makeDevice('visible', { position: { x: 10, y: 10 } });
    const outside = makeDevice('outside', { position: { x: 100, y: 100 } });

    expect(selectFloorDeviceLabels({
      ...baseOptions,
      viewState: viewState(VISIBLE_DEVICE_LABEL_MIN_ZOOM),
      devices: [visible, outside],
    })).toEqual([visible]);
  });

  it('deduplicates selected/priority devices and caps the label collection', () => {
    const devices = Array.from({ length: MAX_FLOOR_DEVICE_LABELS + 30 }, (_, index) => (
      makeDevice(`device-${index}`, { position: { x: 10, y: 10 } })
    ));

    const labels = selectFloorDeviceLabels({
      ...baseOptions,
      viewState: viewState(VISIBLE_DEVICE_LABEL_MIN_ZOOM),
      devices,
      priorityDevices: [devices[0]!],
      selectedDevice: devices[0],
    });

    expect(labels).toHaveLength(MAX_FLOOR_DEVICE_LABELS);
    expect(labels[0]).toBe(devices[0]);
    expect(new Set(labels.map((device) => device.id)).size).toBe(MAX_FLOOR_DEVICE_LABELS);
  });
});
