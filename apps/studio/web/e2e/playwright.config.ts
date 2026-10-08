import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  reporter: [['line']],
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.STUDIO_E2E_URL ?? 'https://localhost',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
