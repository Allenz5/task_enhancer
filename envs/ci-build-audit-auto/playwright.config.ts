import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.PORT || 5273);

export default defineConfig({
  testDir: '.',
  testMatch: /ground_truth\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    acceptDownloads: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'node server/index.js',
    url: `http://localhost:${PORT}/api/studio/dashboard`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
