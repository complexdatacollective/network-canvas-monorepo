import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

import { disableModernAnimationsSetup } from '@codaco/vitest-config/modern/setup-path';

// Tests run in real Chromium, which CI runner images don't ship for the
// pinned Playwright build. The test scripts run `playwright install` first
// (a fast no-op once installed) so the download happens inside the turbo
// task — skipped entirely when the task is a cache hit.
export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  // Browser Mode serves native ESM; explicitly dedupe React so the linked
  // fresco-ui source uses the renderer's React instance rather than creating
  // a second hook runtime.
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  // The automatic JSX runtime is injected by the transform, so Vite's static
  // scanner never sees it before the first browser test starts. Left out, it
  // is discovered while the suite is already running, and the re-optimise that
  // follows changes the `browserv` hash and reloads the page, killing the
  // in-flight test-file fetches — the suite then fails with "Failed to fetch
  // dynamically imported module" on a cold cache while passing on a warm one.
  optimizeDeps: {
    include: ['react/jsx-dev-runtime'],
  },
  test: {
    name: 'browser',
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    setupFiles: [disableModernAnimationsSetup],
    testTimeout: 20_000,
    browser: {
      provider: playwright(),
      enabled: true,
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
  },
});
