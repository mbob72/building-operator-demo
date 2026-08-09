import type { Dispatch, SetStateAction } from 'react';
import type { SceneViewState } from './viewport';

interface SceneControlsProps {
  viewState: SceneViewState;
  setViewState: Dispatch<SetStateAction<SceneViewState>>;
  onFit: () => void;
}

const ZOOM_STEP = 0.35;

export const SceneControls = ({ viewState, setViewState, onFit }: SceneControlsProps) => {
  const changeZoom = (delta: number) => setViewState((current) => ({
    ...current,
    zoom: Math.max(current.minZoom, Math.min(current.maxZoom, current.zoom + delta)),
  }));

  return (
    <div className="scene__tools">
      <button type="button" onClick={() => changeZoom(ZOOM_STEP)} aria-label="Zoom in">+</button>
      <button type="button" onClick={() => changeZoom(-ZOOM_STEP)} aria-label="Zoom out">−</button>
      <button type="button" className="scene__fit" onClick={onFit}>Fit</button>
    </div>
  );
};
