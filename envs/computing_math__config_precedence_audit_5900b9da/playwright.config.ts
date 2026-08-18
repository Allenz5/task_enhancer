import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT) || 5173;

export default defineConfig({
  testDir: '.',
  testMatch: /ground_truth\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
