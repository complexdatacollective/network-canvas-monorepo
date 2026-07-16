import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Tests run in real Chromium, which CI runner images don't ship for the
// pinned Playwright build. The test scripts run `playwright install` first
// (a fast no-op once installed) so the download happens inside the turbo
// task — skipped entirely when the task is a cache hit.
export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    name: 'browser',
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    testTimeout: 20_000,
    browser: {
      provider: playwright(),
      enabled: true,
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
  },
});
