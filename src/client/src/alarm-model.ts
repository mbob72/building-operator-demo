import type {
  Alarm,
  AlarmSeverity,
  AlarmState,
} from '../../shared/domain-contracts';

export type AlarmSeverityFilter = AlarmSeverity | 'all';
export type AlarmStateFilter = AlarmState | 'all';

export interface AlarmFilters {
  severity: AlarmSeverityFilter;
  state: AlarmStateFilter;
}

const severityRank: Record<AlarmSeverity, number> = { critical: 0, warning: 1 };
const stateRank: Record<AlarmState, number> = { active: 0, acknowledged: 1, resolved: 2 };

export const filterAndSortAlarms = (
  alarms: Iterable<Alarm>,
  filters: AlarmFilters,
) => [...alarms]
  .filter((alarm) => (
    (filters.severity === 'all' || alarm.severity === filters.severity)
    && (filters.state === 'all' || alarm.state === filters.state)
  ))
  .sort((left, right) => (
    stateRank[left.state] - stateRank[right.state]
    || severityRank[left.severity] - severityRank[right.severity]
    || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    || left.id.localeCompare(right.id)
  ));

export const countOpenAlarms = (alarms: Iterable<Alarm>) => {
  let active = 0;
  let acknowledged = 0;
  for (const alarm of alarms) {
    if (alarm.state === 'active') active += 1;
    else if (alarm.state === 'acknowledged') acknowledged += 1;
  }
  return { active, acknowledged, total: active + acknowledged };
};

export const selectVisibleAlarmByDevice = (alarms: Iterable<Alarm>) => {
  const result = new Map<string, Alarm>();
  for (const alarm of alarms) {
    if (alarm.state === 'resolved') continue;
    const current = result.get(alarm.deviceId);
    if (!current || stateRank[alarm.state] < stateRank[current.state]
      || (alarm.state === current.state
        && severityRank[alarm.severity] < severityRank[current.severity])) {
      result.set(alarm.deviceId, alarm);
    }
  }
  return result;
};
