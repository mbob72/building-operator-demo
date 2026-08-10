import { defineConfig, devices } from '@playwright/test';

const fixture = process.env.BUILDING_DEVICE_FIXTURE === 'stress'
  ? 'stress'
  : 'representative';

export default defineConfig({
  testDir: './tests/performance',
  outputDir: `test-results/performance-${fixture}`,
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5273',
    // Trace screenshots force synchronous canvas readback and invalidate frame-time results.
    trace: 'off',
    launchOptions: {
      // Headless Chromium defaults to SwiftShader on macOS; Metal keeps the renderer
      // representative of the target workstation while retaining deterministic automation.
      args: ['--enable-precise-memory-info', '--use-angle=metal'],
    },
  },
  webServer: [
    {
      command: `exec env BUILDING_DEVICE_FIXTURE=${fixture} ENABLE_PERFORMANCE_ROUTES=1 PORT=3101 HOST=127.0.0.1 node --import tsx src/server/index.ts`,
      url: 'http://127.0.0.1:3101/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'exec env API_ORIGIN=http://127.0.0.1:3101 ./node_modules/.bin/vite --config vite.config.ts --host 127.0.0.1 --port 5273 --strictPort',
      url: 'http://127.0.0.1:5273',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
