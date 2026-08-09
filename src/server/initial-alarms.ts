import { AlarmSchema, type Alarm } from '../shared/domain-contracts.js';
import { deviceCatalog } from './device-catalog.js';
import { initialTelemetry } from './state-snapshot.js';

const INITIAL_ALARM_TIME = '2026-08-08T00:00:00.000Z';
const statusByDeviceId = new Map(
  initialTelemetry.map((telemetry) => [telemetry.deviceId, telemetry.status]),
);

export const initialAlarms: Alarm[] = deviceCatalog.floors.flatMap((floor) => {
  const floorDevices = deviceCatalog.devices.filter((device) => device.floorId === floor.id);
  const warnings = floorDevices.filter((device) => statusByDeviceId.get(device.id) === 'warning');
  const criticals = floorDevices.filter((device) => statusByDeviceId.get(device.id) === 'critical');
  return [warnings[0], criticals[0], warnings[1], criticals[1]]
    .filter((device) => device !== undefined)
    .map((device, index) => {
      const severity = statusByDeviceId.get(device.id) === 'critical' ? 'critical' : 'warning';
      const state = index === 3 ? 'resolved' : index === 2 ? 'acknowledged' : 'active';
      return AlarmSchema.parse({
        id: `alarm-initial-${device.id}`,
        deviceId: device.id,
        severity,
        code: severity === 'critical' ? 'CRITICAL_DEVICE_STATUS' : 'WARNING_DEVICE_STATUS',
        message: `${device.name} reported a simulated ${severity} condition`,
        createdAt: INITIAL_ALARM_TIME,
        updatedAt: INITIAL_ALARM_TIME,
        state,
        acknowledgedAt: state === 'acknowledged' ? INITIAL_ALARM_TIME : null,
        acknowledgedBy: state === 'acknowledged' ? 'demo-operator' : null,
        resolvedAt: state === 'resolved' ? INITIAL_ALARM_TIME : null,
      });
    });
});
