// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneResponse } from '../../src/shared/scene-contracts';
import { FLOOR_SCENE_REQUEST_DEBOUNCE_MS } from '../../src/client/src/floor-scene-config';
import { loadScene } from '../../src/client/src/scene-api';
import { useFloorScene } from '../../src/client/src/use-floor-scene';
import { viewStateToBBox } from '../../src/client/src/viewport';

vi.mock('../../src/client/src/scene-api', () => ({
  loadScene: vi.fn(),
}));

const mockedLoadScene = vi.mocked(loadScene);
const floor = {
  id: 'floor-1',
  name: 'Floor 1',
  elevation: 0,
  bounds: [0, 0, 100, 50] as [number, number, number, number],
};
const size = { width: 500, height: 250 };

describe('useFloorScene request lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedLoadScene.mockReset();
    mockedLoadScene.mockResolvedValue({} as SceneResponse);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces a request and sends the fitted camera bbox and zoom', async () => {
    const { result, unmount } = renderHook(() => useFloorScene({
      floor,
      size,
      onSelectDevice: vi.fn(),
    }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLOOR_SCENE_REQUEST_DEBOUNCE_MS - 1);
    });
    expect(mockedLoadScene).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(mockedLoadScene).toHaveBeenCalledOnce();
    expect(mockedLoadScene).toHaveBeenCalledWith({
      floorId: floor.id,
      viewport: {
        bbox: viewStateToBBox(result.current.viewState, size.width, size.height),
        width: size.width,
        height: size.height,
      },
      zoom: result.current.viewState.zoom,
    }, expect.any(AbortSignal));
    unmount();
  });

  it('aborts an in-flight request when the camera changes', async () => {
    const { result, unmount } = renderHook(() => useFloorScene({
      floor,
      size,
      onSelectDevice: vi.fn(),
    }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLOOR_SCENE_REQUEST_DEBOUNCE_MS);
    });
    mockedLoadScene.mockClear();
    mockedLoadScene.mockImplementation(() => new Promise<SceneResponse>(() => undefined));

    act(() => {
      result.current.setViewState((current) => ({ ...current, zoom: current.zoom + 0.5 }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLOOR_SCENE_REQUEST_DEBOUNCE_MS);
    });

    const signal = mockedLoadScene.mock.calls[0]?.[1];
    expect(signal?.aborted).toBe(false);

    act(() => {
      result.current.setViewState((current) => ({ ...current, zoom: current.zoom + 0.5 }));
    });
    expect(signal?.aborted).toBe(true);
    unmount();
  });
});
