import { ScatterplotLayer } from '@deck.gl/layers';
import type { Alarm, DeviceMetadata } from '../../shared/domain-contracts';

interface AlarmIndicatorLayerOptions<T> {
  id: string;
  data: T[];
  getDevice: (item: T) => DeviceMetadata;
  getPosition: (item: T) => [number, number];
  alarmByDeviceId: ReadonlyMap<string, Alarm>;
}

const alarmColor = (alarm: Alarm): [number, number, number, number] => {
  if (alarm.state === 'acknowledged') return [102, 164, 174, 225];
  return alarm.severity === 'critical' ? [255, 86, 80, 255] : [247, 188, 70, 250];
};

export const createAlarmIndicatorLayer = <T>({
  id,
  data,
  getDevice,
  getPosition,
  alarmByDeviceId,
}: AlarmIndicatorLayerOptions<T>) => new ScatterplotLayer<T>({
  id,
  data,
  getPosition,
  filled: false,
  stroked: true,
  getLineColor: (item) => alarmColor(alarmByDeviceId.get(getDevice(item).id)!),
  getRadius: (item) => {
    const alarm = alarmByDeviceId.get(getDevice(item).id)!;
    return alarm.severity === 'critical' ? 12 : 10;
  },
  radiusUnits: 'pixels',
  radiusMinPixels: 8,
  radiusMaxPixels: 16,
  getLineWidth: (item) => (
    alarmByDeviceId.get(getDevice(item).id)?.state === 'active' ? 2.5 : 1.5
  ),
  lineWidthUnits: 'pixels',
  pickable: false,
});
