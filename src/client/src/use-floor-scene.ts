import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEventHandler } from 'react';
import type { OrthographicView } from '@deck.gl/core';
import type { DeckGLRef } from '@deck.gl/react';
import type { DeviceMetadata } from '../../shared/domain-contracts';
import type { FloorSummary, SceneResponse } from '../../shared/scene-contracts';
import {
  FLOOR_DEVICE_LAYER_IDS,
  FLOOR_SCENE_REQUEST_DEBOUNCE_MS,
} from './floor-scene-config';
import { loadScene } from './scene-api';
import type { ElementSize } from './use-element-size';
import { fitFloor, viewStateToBBox, type SceneViewState } from './viewport';

interface UseFloorSceneOptions {
  floor: FloorSummary;
  size: ElementSize;
  onSelectDevice: (deviceId?: string) => void;
}

interface NextSceneViewState {
  target?: number[];
  zoom?: number | number[];
}

const initialViewState: SceneViewState = {
  target: [50, 50, 0],
  zoom: 2.5,
  minZoom: -1,
  maxZoom: 7,
};

export const useFloorScene = ({ floor, size, onSelectDevice }: UseFloorSceneOptions) => {
  const [viewState, setViewState] = useState<SceneViewState>(initialViewState);
  const [scene, setScene] = useState<SceneResponse>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const initializedFloor = useRef<string | undefined>(undefined);
  const deckRef = useRef<DeckGLRef<OrthographicView> | null>(null);

  useEffect(() => {
    if (!size.width || !size.height || initializedFloor.current === floor.id) return;
    setViewState(fitFloor(floor, size.width, size.height));
    initializedFloor.current = floor.id;
    setScene(undefined);
  }, [floor, size.height, size.width]);

  useEffect(() => {
    if (!size.width || !size.height) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const nextScene = await loadScene({
          floorId: floor.id,
          viewport: {
            bbox: viewStateToBBox(viewState, size.width, size.height),
            width: size.width,
            height: size.height,
          },
          zoom: viewState.zoom,
        }, controller.signal);
        setScene(nextScene);
        setError(undefined);
      } catch (requestError) {
        if (!(requestError instanceof DOMException && requestError.name === 'AbortError')) {
          setError(requestError instanceof Error ? requestError.message : 'Unknown scene error');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, FLOOR_SCENE_REQUEST_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [floor.id, size.height, size.width, viewState]);

  const fitView = useCallback(() => {
    if (size.width && size.height) setViewState(fitFloor(floor, size.width, size.height));
  }, [floor, size.height, size.width]);

  const updateViewState = useCallback((nextViewState: NextSceneViewState) => {
    setViewState((current) => {
      const target = nextViewState.target ?? current.target;
      return {
        target: [target[0] ?? current.target[0], target[1] ?? current.target[1], target[2] ?? 0],
        zoom: typeof nextViewState.zoom === 'number' ? nextViewState.zoom : current.zoom,
        minZoom: current.minZoom,
        maxZoom: current.maxZoom,
      };
    });
  }, []);

  const handleSceneClick = useCallback<MouseEventHandler<HTMLDivElement>>((event) => {
    if (!(event.target instanceof HTMLCanvasElement)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const picked = deckRef.current?.pickObject({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      radius: 4,
      layerIds: [...FLOOR_DEVICE_LAYER_IDS],
    });
    if (picked?.object) onSelectDevice((picked.object as DeviceMetadata).id);
  }, [onSelectDevice]);

  return {
    deckRef,
    viewState,
    setViewState,
    scene,
    error,
    loading,
    fitView,
    updateViewState,
    handleSceneClick,
  };
};
