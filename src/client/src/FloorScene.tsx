import DeckGL from '@deck.gl/react';
import { OrthographicView } from '@deck.gl/core';
import type {
  DeviceMetadata,
  DeviceTelemetry,
} from '../../shared/domain-contracts';
import type { FloorSummary } from '../../shared/scene-contracts';
import { DeviceCard } from './DeviceCard';
import { SceneControls } from './SceneControls';
import { sceneEmptyMessage } from './scene-empty-state';
import { useElementSize } from './use-element-size';
import { useFloorScene } from './use-floor-scene';
import { useFloorSceneLayers } from './use-floor-scene-layers';

interface FloorSceneProps {
  floor: FloorSummary;
  floors: FloorSummary[];
  devices: DeviceMetadata[];
  telemetryByDeviceId: ReadonlyMap<string, DeviceTelemetry>;
  selectedDevice: DeviceMetadata | undefined;
  onSelectDevice: (deviceId?: string) => void;
}

export const FloorScene = ({
  floor,
  floors,
  devices,
  telemetryByDeviceId,
  selectedDevice,
  onSelectDevice,
}: FloorSceneProps) => {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const controller = useFloorScene({
    floor,
    size,
    onSelectDevice,
  });
  const { layers, priorityDeviceCount } = useFloorSceneLayers({
    floorId: floor.id,
    size,
    viewState: controller.viewState,
    scene: controller.scene,
    devices,
    telemetryByDeviceId,
    selectedDevice,
  });
  const emptySceneMessage = sceneEmptyMessage(controller.scene);

  return (
    <div
      className="scene"
      ref={ref}
      data-testid="floor-scene"
      onClick={controller.handleSceneClick}
    >
      <DeckGL
        ref={controller.deckRef}
        views={new OrthographicView({ id: 'floor-view', flipY: false })}
        viewState={controller.viewState}
        controller={{ dragPan: true, scrollZoom: true, doubleClickZoom: true, touchZoom: true }}
        layers={layers}
        getCursor={({ isDragging, isHovering }) => (
          isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'
        )}
        onViewStateChange={({ viewState: nextViewState }) => controller.updateViewState(nextViewState)}
      />
      <SceneControls
        viewState={controller.viewState}
        setViewState={controller.setViewState}
        onFit={controller.fitView}
      />
      <div className="scene__status" aria-live="polite">
        <span className={`status-dot ${controller.error ? 'status-dot--error' : ''}`} />
        {controller.error
          ?? `${controller.scene?.zoomBand ?? 'loading'} · ${controller.scene?.meta.returnedFeatures ?? 0}/${controller.scene?.meta.totalFeatures ?? 0} features · ${devices.length} devices · ${priorityDeviceCount} priority · z ${controller.viewState.zoom.toFixed(2)}${controller.loading ? ' · updating' : ''}`}
      </div>
      {emptySceneMessage && (
        <div className="scene__empty-state" role="status">
          {emptySceneMessage}
        </div>
      )}
      {selectedDevice && selectedDevice.floorId === floor.id && (
        <DeviceCard
          device={selectedDevice}
          telemetry={telemetryByDeviceId.get(selectedDevice.id)}
          floors={floors}
          onClose={() => onSelectDevice(undefined)}
        />
      )}
    </div>
  );
};
