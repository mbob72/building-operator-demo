import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);
const isProduction = process.env.NODE_ENV === 'production';
const host = process.env.HOST ?? (isProduction ? '0.0.0.0' : '127.0.0.1');
const realtimeSimulatorIntervalMs = Number(process.env.REALTIME_SIMULATOR_INTERVAL_MS ?? 250);
const realtimeSimulatorBatchSize = Number(process.env.REALTIME_SIMULATOR_BATCH_SIZE ?? 24);
const app = buildApp({
  serveStatic: isProduction,
  startRealtimeSimulator: true,
  realtimeSimulatorIntervalMs,
  realtimeSimulatorBatchSize,
  enablePerformanceRoutes: process.env.ENABLE_PERFORMANCE_ROUTES === '1',
});

const close = async () => {
  await app.close();
  process.exit(0);
};

process.on('SIGINT', close);
process.on('SIGTERM', close);

try {
  await app.listen({ port, host });
  console.log(`Building operator server listening at http://${host}:${port}`);
} catch (error) {
  console.error('Failed to start building operator server', error);
  process.exit(1);
}
