import { useEffect, useState } from 'react';
import type { FloorSummary } from '../../shared/scene-contracts';
import { FloorScene } from './FloorScene';
import { loadFloors } from './scene-api';

export const App = () => {
  const [floor, setFloor] = useState<FloorSummary>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    loadFloors(controller.signal)
      .then(([firstFloor]) => {
        if (!firstFloor) throw new Error('Scene API returned no floors');
        setFloor(firstFloor);
      })
      .catch((requestError) => {
        if (!(requestError instanceof DOMException && requestError.name === 'AbortError')) {
          setError(requestError instanceof Error ? requestError.message : 'Unknown floor error');
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">OPERATOR SCENE / STAGE 3</p>
          <h1>{floor?.name ?? 'Loading floor…'}</h1>
        </div>
        <div className="topbar__meta">
          <span>VIEWPORT API</span>
          <span>REAL IFC FLOOR</span>
          <span>GPU DEVICE LAYER</span>
        </div>
      </header>
      <section className="workspace">
        {error && <div className="fatal-error">{error}</div>}
        {floor && <FloorScene floor={floor} />}
      </section>
      <footer className="footer">
        <span>Drag to pan · wheel or controls to zoom</span>
        <span>Floor geometry and stable device metadata are separate layers</span>
      </footer>
    </main>
  );
};
