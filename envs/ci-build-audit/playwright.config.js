// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.PORT || 5173);
const baseURL = `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: '.',
  testMatch: 'ground_truth.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [['list']],
  use: {
    baseURL,
    viewport: { width: 1440, height: 960 },
    acceptDownloads: true,
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node server/index.js',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
