import type { FloorSummary } from '../../shared/scene-contracts';
import { BuildingOverview } from './BuildingOverview';
import { FloorScene } from './FloorScene';
import { OperatorToolbar } from './OperatorToolbar';
import { useOperatorWorkspaceModel } from './use-operator-workspace';

interface OperatorWorkspaceProps {
  floors: FloorSummary[];
}

export const OperatorWorkspace = ({ floors }: OperatorWorkspaceProps) => {
  const model = useOperatorWorkspaceModel(floors);

  return (
    <>
      <OperatorToolbar
        floors={floors}
        visibleDevices={model.filteredDevices.length}
        totalDevices={model.devices.length}
      />
      <div className="operator-workspace__scene">
        {model.requestError && (
          <div className="workspace-state workspace-state--error">
            {model.requestError instanceof Error
              ? model.requestError.message
              : 'Operator data request failed'}
          </div>
        )}
        {!model.requestError && model.isLoading && (
          <div className="workspace-state">Loading device catalog and status snapshot…</div>
        )}
        {!model.requestError && !model.isLoading && model.selectedFloor && model.viewMode === 'floor' && (
          <FloorScene
            floor={model.selectedFloor}
            floors={floors}
            devices={model.filteredDevices}
            telemetryByDeviceId={model.telemetryByDeviceId}
            selectedDevice={model.selectedDevice}
            onSelectDevice={model.onSelectDevice}
          />
        )}
        {!model.requestError && !model.isLoading && model.viewMode === 'overview' && (
          <BuildingOverview
            floors={floors}
            devices={model.filteredDevices}
            telemetryByDeviceId={model.telemetryByDeviceId}
            selectedDevice={model.selectedDevice}
            onSelectDevice={model.onSelectDevice}
          />
        )}
      </div>
    </>
  );
};
