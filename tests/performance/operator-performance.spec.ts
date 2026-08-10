import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { resolve } from 'node:path';

const fixture = process.env.BUILDING_DEVICE_FIXTURE === 'stress'
  ? 'stress'
  : 'representative';
const expectedDevices = fixture === 'stress' ? 50_000 : 18_000;

interface ClientMetrics {
  reactCommitCount: number;
  reactActualDurationsMs: number[];
  realtimeBatchCount: number;
  realtimeEventCount: number;
  realtimeBatchApplyDurationsMs: number[];
  realtimeLatenciesMs: number[];
}

interface LongTaskSample {
  phase: string;
  startTimeMs: number;
  durationMs: number;
}

const percentile = (values: number[], quantile: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
};

const summarize = (values: number[]) => ({
  count: values.length,
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  p99: percentile(values, 0.99),
  max: values.length > 0 ? Math.max(...values) : 0,
});

const startFrameCapture = async (page: Page) => page.evaluate(() => {
  const target = window as typeof window & {
    __benchmarkFrames?: number[];
    __benchmarkFrameHandle?: number;
  };
  target.__benchmarkFrames = [];
  let previous = performance.now();
  const capture = (now: number) => {
    target.__benchmarkFrames!.push(now - previous);
    previous = now;
    target.__benchmarkFrameHandle = requestAnimationFrame(capture);
  };
  target.__benchmarkFrameHandle = requestAnimationFrame(capture);
});

const stopFrameCapture = async (page: Page) => page.evaluate(() => {
  const target = window as typeof window & {
    __benchmarkFrames?: number[];
    __benchmarkFrameHandle?: number;
  };
  if (target.__benchmarkFrameHandle !== undefined) {
    cancelAnimationFrame(target.__benchmarkFrameHandle);
  }
  return (target.__benchmarkFrames ?? []).slice(2);
});

const heapSize = async (page: Page) => {
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  const response = await session.send('Performance.getMetrics');
  await session.detach();
  return response.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? 0;
};

const setBenchmarkPhase = async (page: Page, phase: string) => page.evaluate((value) => {
  const target = window as typeof window & { __benchmarkPhase?: string };
  target.__benchmarkPhase = value;
}, phase);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as typeof window & {
      __benchmarkLongTasks?: LongTaskSample[];
      __benchmarkPhase?: string;
    };
    target.__benchmarkLongTasks = [];
    target.__benchmarkPhase = 'startup';
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            target.__benchmarkLongTasks!.push({
              phase: target.__benchmarkPhase ?? 'unknown',
              startTimeMs: entry.startTime,
              durationMs: entry.duration,
            });
          }
        });
        observer.observe({ type: 'longtask', buffered: true });
      } catch {
        // A browser without the longtask entry type reports an empty sample.
      }
    }
  });
});

test(`measures ${fixture} operator workload`, async ({ page }, testInfo) => {
  await page.goto('/');
  const realtimeStatus = page.getByTestId('realtime-status');
  await expect(realtimeStatus).toHaveText(/live · #\d+/, { timeout: 30_000 });
  const catalogResponse = await page.request.get('/api/v1/catalog?buildingId=west-riverside');
  expect(catalogResponse.ok()).toBe(true);
  expect((await catalogResponse.json()).totalDevices).toBe(expectedDevices);
  await expect(page.getByTestId('floor-scene')).toBeVisible();

  const navigation = await page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return {
      responseEndMs: entry.responseEnd,
      domContentLoadedMs: entry.domContentLoadedEventEnd,
      loadMs: entry.loadEventEnd,
      transferSizeBytes: entry.transferSize,
      decodedBodySizeBytes: entry.decodedBodySize,
    };
  });
  const heapBeforeBytes = await heapSize(page);
  const graphics = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl');
    const extension = context?.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: extension
        ? String(context?.getParameter(extension.UNMASKED_RENDERER_WEBGL) ?? 'unknown')
        : 'unavailable',
      vendor: extension
        ? String(context?.getParameter(extension.UNMASKED_VENDOR_WEBGL) ?? 'unknown')
        : 'unavailable',
    };
  });

  await setBenchmarkPhase(page, 'floor-interaction');
  await startFrameCapture(page);
  const scene = page.getByTestId('floor-scene');
  const sceneBox = await scene.boundingBox();
  if (!sceneBox) throw new Error('Floor scene has no layout box');
  await page.mouse.move(sceneBox.x + sceneBox.width * 0.55, sceneBox.y + sceneBox.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(sceneBox.x + sceneBox.width * 0.45, sceneBox.y + sceneBox.height * 0.45, {
    steps: 12,
  });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await page.getByRole('button', { name: 'Fit' }).click();
  await page.waitForTimeout(1_200);
  const floorFrameIntervalsMs = await stopFrameCapture(page);

  await setBenchmarkPhase(page, 'overview-navigation');
  await startFrameCapture(page);
  await page.getByRole('button', { name: 'Building' }).click();
  await expect(page.getByTestId('building-overview')).toBeVisible();
  await expect(page.locator('.scene__status')).toContainText(`${expectedDevices} devices`);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await setBenchmarkPhase(page, 'overview-filter');
  await page.getByRole('checkbox', { name: 'All statuses' }).uncheck();
  await page.getByRole('checkbox', { name: 'critical' }).check();
  await page.waitForTimeout(1_500);
  await setBenchmarkPhase(page, 'overview-reset');
  await page.getByRole('button', { name: 'Reset' }).click();
  const overviewFrameIntervalsMs = await stopFrameCapture(page);

  const sequenceBeforeBurst = Number((await realtimeStatus.textContent())?.match(/#(\d+)/)?.[1]);
  await setBenchmarkPhase(page, 'realtime-burst');
  await startFrameCapture(page);
  for (let index = 0; index < 20; index += 1) {
    const burstResponse = await page.request.post('/api/benchmark/realtime-burst', {
      data: { batchSize: 250 },
    });
    expect(burstResponse.ok()).toBe(true);
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(2_000);
  const burstFrameIntervalsMs = await stopFrameCapture(page);
  const sequenceAfterBurst = Number((await realtimeStatus.textContent())?.match(/#(\d+)/)?.[1]);

  const clientMetrics = await page.evaluate(() => {
    const value = window.__buildingOperatorPerformance;
    if (!value) throw new Error('Client performance metrics are unavailable');
    return structuredClone(value) as ClientMetrics;
  });
  const longTasks = await page.evaluate(() => (
    (window as typeof window & { __benchmarkLongTasks?: LongTaskSample[] })
      .__benchmarkLongTasks ?? []
  ));
  const heapAfterBytes = await heapSize(page);
  const domNodes = await page.locator('*').count();

  const result = {
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    fixture,
    profile: testInfo.project.name,
    expectedDevices,
    environment: {
      platform: platform(),
      release: release(),
      cpu: cpus()[0]?.model ?? 'unknown',
      logicalCpuCount: cpus().length,
      totalMemoryBytes: totalmem(),
      userAgent: await page.evaluate(() => navigator.userAgent),
      viewport: page.viewportSize(),
      graphics,
    },
    navigation,
    frameIntervalsMs: {
      floor: summarize(floorFrameIntervalsMs),
      overview: summarize(overviewFrameIntervalsMs),
      realtimeBurst: summarize(burstFrameIntervalsMs),
    },
    longTasksMs: summarize(longTasks.map((sample) => sample.durationMs)),
    longTasksByPhase: Object.fromEntries(
      [...new Set(longTasks.map((sample) => sample.phase))].map((phase) => [
        phase,
        summarize(longTasks
          .filter((sample) => sample.phase === phase)
          .map((sample) => sample.durationMs)),
      ]),
    ),
    longTaskSamples: longTasks,
    heap: {
      beforeBytes: heapBeforeBytes,
      afterBytes: heapAfterBytes,
      deltaBytes: heapAfterBytes - heapBeforeBytes,
    },
    react: {
      commitCount: clientMetrics.reactCommitCount,
      actualDurationMs: summarize(clientMetrics.reactActualDurationsMs),
    },
    realtime: {
      batchCount: clientMetrics.realtimeBatchCount,
      eventCount: clientMetrics.realtimeEventCount,
      sequenceDeltaDuringBurst: sequenceAfterBurst - sequenceBeforeBurst,
      batchApplyMs: summarize(clientMetrics.realtimeBatchApplyDurationsMs),
      latencyMs: summarize(clientMetrics.realtimeLatenciesMs),
    },
    domNodes,
  };

  const reportDirectory = resolve(process.cwd(), 'reports/performance');
  mkdirSync(reportDirectory, { recursive: true });
  writeFileSync(
    resolve(reportDirectory, `${fixture}-${testInfo.project.name}.json`),
    `${JSON.stringify(result, null, 2)}\n`,
  );

  const frameBudgetMs = testInfo.project.name.startsWith('mobile') ? 100 : 75;
  const heapBudgetBytes = fixture === 'stress' ? 750_000_000 : 500_000_000;
  expect(result.frameIntervalsMs.floor.p95).toBeLessThan(frameBudgetMs);
  expect(result.frameIntervalsMs.overview.p95).toBeLessThan(frameBudgetMs);
  expect(result.frameIntervalsMs.realtimeBurst.p95).toBeLessThan(frameBudgetMs);
  expect(result.longTasksMs.max).toBeLessThan(1_000);
  expect(result.heap.afterBytes).toBeLessThan(heapBudgetBytes);
  expect(result.react.actualDurationMs.p95).toBeLessThan(100);
  expect(result.realtime.batchApplyMs.p95).toBeLessThan(50);
  expect(result.realtime.latencyMs.p95).toBeLessThan(1_000);
  expect(result.realtime.sequenceDeltaDuringBurst).toBeGreaterThanOrEqual(5_000);
  expect(result.domNodes).toBeLessThan(600);
});
