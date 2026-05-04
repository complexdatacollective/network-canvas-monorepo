import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: 'http://localhost:4101',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command:
        'pnpm --filter @codaco/interview exec vite --config e2e/host/vite.config.ts',
      port: 4101,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command:
        'pnpm --filter @codaco/interview exec tsx e2e/helpers/assetServer.ts',
      port: 4200,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
