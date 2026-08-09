import { useQuery } from '@tanstack/react-query';
import { OperatorWorkspace } from './OperatorWorkspace';
import { useOperatorStore } from './operator-store';
import { loadFloors } from './scene-api';

export const App = () => {
  const floorsQuery = useQuery({
    queryKey: ['floors'],
    queryFn: ({ signal }) => loadFloors(signal),
    staleTime: 5 * 60_000,
  });
  const viewMode = useOperatorStore((state) => state.viewMode);
  const selectedFloorId = useOperatorStore((state) => state.selectedFloorId);
  const selectedFloor = floorsQuery.data?.find((floor) => floor.id === selectedFloorId)
    ?? floorsQuery.data?.[0];
  const title = viewMode === 'overview'
    ? 'West Riverside · Building overview'
    : selectedFloor?.name ?? 'Loading floor…';

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">OPERATOR SCENE / STAGE 6</p>
          <h1>{title}</h1>
        </div>
        <div className="topbar__meta">
          <span>8 FLOORS</span>
          <span>18K DEVICES</span>
          <span>LIVE TELEMETRY</span>
          <span>ALARM LIFECYCLE</span>
        </div>
      </header>
      <section className="workspace">
        {floorsQuery.error && (
          <div className="fatal-error">
            {floorsQuery.error instanceof Error ? floorsQuery.error.message : 'Unknown floor error'}
          </div>
        )}
        {floorsQuery.isLoading && <div className="workspace-state">Loading building…</div>}
        {floorsQuery.data && floorsQuery.data.length > 0 && (
          <OperatorWorkspace floors={floorsQuery.data} />
        )}
      </section>
      <footer className="footer">
        <span>Drag to pan · wheel or controls to zoom · click a device for details</span>
        <span>Geometry · stable catalog · realtime hot state are independent data flows</span>
      </footer>
    </main>
  );
};
