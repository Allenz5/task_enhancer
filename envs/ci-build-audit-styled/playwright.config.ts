import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /ground_truth\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:' + (process.env.PORT || 5373),
    acceptDownloads: true,
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 }
  }
});
