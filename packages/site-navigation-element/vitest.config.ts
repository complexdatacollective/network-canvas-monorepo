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
  // The shared test setup is loaded from fresco-ui so every modern Vitest
  // project uses the same animation policy. Browser Mode serves native ESM;
  // explicitly dedupe React so that setup and the linked fresco-ui source use
  // the renderer's React instance rather than creating a second hook runtime.
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  test: {
    name: 'browser',
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    setupFiles: ['../fresco-ui/vitest.setup.disable-animations.ts'],
    testTimeout: 20_000,
    browser: {
      provider: playwright(),
      enabled: true,
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
  },
});
