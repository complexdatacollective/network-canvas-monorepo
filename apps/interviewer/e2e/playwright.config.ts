import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  snapshotDir: './visual-snapshots',
  snapshotPathTemplate: '{snapshotDir}/{projectName}/{arg}{ext}',

  // Fresh context per test → IndexedDB + localStorage isolated for free.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 45_000,

  reporter: [
    ['line'],
    ['html', { outputFolder: './playwright-report', open: 'never' }],
    ['json', { outputFile: './test-results/results.json' }],
  ],

  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixels: 250,
    },
  },

  use: {
    baseURL: 'http://localhost:4180',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    viewport: { width: 1920, height: 1080 },
    // reducedMotion lives under contextOptions (not top-level, unlike its `use`
    // siblings above) to work around a @playwright/test@1.61.1 TS2769 overload
    // resolution bug — don't "simplify" this back, it reintroduces the type error.
    contextOptions: { reducedMotion: 'reduce' },
    // Block the service worker: deterministic tests, page.route works, no
    // SW-cache bleed between contexts. SW/offline behaviour is out of scope.
    serviceWorkers: 'block',
  },

  webServer: {
    // Serve the built PWA (not the dev server): the SW only exists in the
    // build, the app's build runs a PWA-integrity check on this exact output,
    // and the dev server's optimizeDeps re-bundle wipes app state mid-test. The
    // build runs upstream in run.sh / test:e2e:headed, so this assumes dist/
    // exists.
    command:
      'pnpm --filter @codaco/interviewer exec vite preview --port 4180 --strictPort',
    port: 4180,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },

  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
});
