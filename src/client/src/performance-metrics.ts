import type { ProfilerOnRenderCallback } from 'react';

const SAMPLE_LIMIT = 20_000;

export interface OperatorPerformanceMetrics {
  reactCommitCount: number;
  reactActualDurationsMs: number[];
  realtimeBatchCount: number;
  realtimeEventCount: number;
  realtimeBatchApplyDurationsMs: number[];
  realtimeLatenciesMs: number[];
}

declare global {
  interface Window {
    __buildingOperatorPerformance?: OperatorPerformanceMetrics;
  }
}

const metrics: OperatorPerformanceMetrics = {
  reactCommitCount: 0,
  reactActualDurationsMs: [],
  realtimeBatchCount: 0,
  realtimeEventCount: 0,
  realtimeBatchApplyDurationsMs: [],
  realtimeLatenciesMs: [],
};

const appendBounded = (target: number[], value: number) => {
  if (target.length < SAMPLE_LIMIT && Number.isFinite(value)) target.push(value);
};

if (typeof window !== 'undefined') window.__buildingOperatorPerformance = metrics;

export const recordReactCommit: ProfilerOnRenderCallback = (
  _id,
  _phase,
  actualDuration,
) => {
  metrics.reactCommitCount += 1;
  appendBounded(metrics.reactActualDurationsMs, actualDuration);
};

export const recordRealtimeBatch = (
  eventCount: number,
  emittedAt: string,
  applyDurationMs: number,
) => {
  metrics.realtimeBatchCount += 1;
  metrics.realtimeEventCount += eventCount;
  appendBounded(metrics.realtimeBatchApplyDurationsMs, applyDurationMs);
  appendBounded(metrics.realtimeLatenciesMs, Math.max(0, Date.now() - Date.parse(emittedAt)));
};
