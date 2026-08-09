import { useState } from 'react';
import DeckGL from '@deck.gl/react';
import { OrthographicView } from '@deck.gl/core';
import type {
  Alarm,
  DeviceMetadata,
  DeviceStatus,
} from '../../shared/domain-contracts';
import type { FloorSummary } from '../../shared/scene-contracts';
import { DeviceCard } from './DeviceCard';
import { SceneControls } from './SceneControls';
import { SceneDeviceTooltip, type HoveredDevice } from './SceneDeviceTooltip';
import { sceneEmptyMessage } from './scene-empty-state';
import { useElementSize } from './use-element-size';
import { useFloorScene } from './use-floor-scene';
import { useFloorSceneLayers } from './use-floor-scene-layers';

interface FloorSceneProps {
  floor: FloorSummary;
  floors: FloorSummary[];
  devices: DeviceMetadata[];
  alarmDevices: DeviceMetadata[];
  alarmsById: ReadonlyMap<string, Alarm>;
  statusByDeviceId: ReadonlyMap<string, DeviceStatus>;
  dirtyStatusDeviceIds: ReadonlySet<string>;
  statusVersion: number;
  priorityMembershipVersion: number;
  priorityMembershipChanged: boolean;
  selectedDevice: DeviceMetadata | undefined;
  onSelectDevice: (deviceId?: string) => void;
}

export const FloorScene = ({
  floor,
  floors,
  devices,
  alarmDevices,
  alarmsById,
  statusByDeviceId,
  dirtyStatusDeviceIds,
  statusVersion,
  priorityMembershipVersion,
  priorityMembershipChanged,
  selectedDevice,
  onSelectDevice,
}: FloorSceneProps) => {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const [hoveredDevice, setHoveredDevice] = useState<HoveredDevice>();
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
    alarmDevices,
    alarmsById,
    statusByDeviceId,
    dirtyStatusDeviceIds,
    statusVersion,
    priorityMembershipVersion,
    priorityMembershipChanged,
    selectedDevice,
  });
  const emptySceneMessage = sceneEmptyMessage(controller.scene);

  return (
    <div
      className="scene"
      ref={ref}
      data-testid="floor-scene"
      onClick={controller.handleSceneClick}
      onMouseLeave={() => setHoveredDevice(undefined)}
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
        onHover={({ object, x, y }) => setHoveredDevice(object
          ? { device: object as DeviceMetadata, x, y }
          : undefined)}
      />
      <SceneDeviceTooltip
        hovered={hoveredDevice}
        status={hoveredDevice
          ? statusByDeviceId.get(hoveredDevice.device.id)
          : undefined}
        floorName={floor.name.replace('West Riverside Hospital · ', '')}
        size={size}
      />
      <SceneControls
        viewState={controller.viewState}
        setViewState={controller.setViewState}
        onFit={controller.fitView}
      />
      <div className="scene__status" aria-live="polite">
        <span className={`status-dot ${controller.error ? 'status-dot--error' : ''}`} />
        <span className="scene__status-content">
          {controller.error ? (
            <span>{controller.error}</span>
          ) : (
            <>
              <span>
                {controller.scene?.zoomBand ?? 'loading'} · {controller.scene?.meta.returnedFeatures ?? 0}/{controller.scene?.meta.totalFeatures ?? 0} features
              </span>
              <span>
                {devices.length} devices · {priorityDeviceCount} priority · z {controller.viewState.zoom.toFixed(2)}{controller.loading ? ' · updating' : ''}
              </span>
            </>
          )}
        </span>
      </div>
      {emptySceneMessage && (
        <div className="scene__empty-state" role="status">
          {emptySceneMessage}
        </div>
      )}
      {selectedDevice && selectedDevice.floorId === floor.id && (
        <DeviceCard
          device={selectedDevice}
          floors={floors}
          onClose={() => onSelectDevice(undefined)}
        />
      )}
    </div>
  );
};
