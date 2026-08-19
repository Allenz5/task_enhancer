import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT) || 5175;

export default defineConfig({
  testDir: '.',
  testMatch: /ground_truth\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  },
  webServer: {
    command: 'node server.js',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
