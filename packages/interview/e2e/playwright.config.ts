import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  snapshotDir: './visual-snapshots',
  snapshotPathTemplate: '{snapshotDir}/{projectName}/{arg}{ext}',

  // Parallelism is per-project: the legacy silos suite stays serial, the
  // matrix/visual projects run fullyParallel with per-test isolated pages.
  fullyParallel: false,
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : '50%',
  // Retry on CI only. The legacy suite is serial (mode: 'serial'), so a retry
  // re-runs the whole group from beforeAll and rebuilds state — recovering
  // known transient visual flakes (e.g. SILOS stage-29, issue #844) so the
  // gate stays green while Playwright still reports them as flaky. Matrix
  // tests are order-independent, so a retry re-runs just the one test. Local
  // stays 0 so flakes surface deterministically while developing.
  retries: process.env.CI ? 2 : 0,
  timeout: 30_000,

  // PW_BLOB switches to the blob reporter so a future shard matrix can merge
  // per-shard reports (see the dormant merge step in ci-and-release.yml and the
  // shard escape-hatch in e2e/README.md). Unset, the local/CI default emits the
  // line + html + json trio.
  reporter: process.env.PW_BLOB
    ? [['blob']]
    : [
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
    baseURL: 'http://localhost:4101',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    viewport: { width: 1920, height: 1080 },
    contextOptions: { reducedMotion: 'reduce' },
  },

  webServer: [
    {
      // Production preview, not the dev server. The dev server's optimizeDeps
      // re-bundles when it discovers a new @base-ui/react subpath at runtime
      // (e.g. the success toast that surfaces only after addNode), which forces
      // a full page reload and wipes the Shell's Redux state mid-test —
      // manifested as a stage-2-final.png mismatch on the SILOS Self-Nomination
      // test. The host bundle is built upstream (run.sh in Docker, or
      // test:e2e:headed locally) so this command assumes e2e/host/dist/ exists.
      command:
        'pnpm --filter @codaco/interview exec vite preview --config e2e/host/vite.config.ts',
      port: 4101,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
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
    // Legacy: the silos serial chain. Keeps its original per-browser snapshot
    // dirs so the committed baselines don't move.
    {
      name: 'chromium-legacy',
      use: devices['Desktop Chrome'],
      testMatch: /silos-protocol\.spec\.ts/,
      fullyParallel: false,
      snapshotPathTemplate: '{snapshotDir}/chromium/{arg}{ext}',
    },
    {
      name: 'firefox-legacy',
      use: devices['Desktop Firefox'],
      testMatch: /silos-protocol\.spec\.ts/,
      fullyParallel: false,
      snapshotPathTemplate: '{snapshotDir}/firefox/{arg}{ext}',
    },
    {
      name: 'webkit-legacy',
      use: devices['Desktop Safari'],
      testMatch: /silos-protocol\.spec\.ts/,
      fullyParallel: false,
      snapshotPathTemplate: '{snapshotDir}/webkit/{arg}{ext}',
    },
    // Matrix: functional assertions + aria snapshots. Fully parallel,
    // per-test isolation (fixtures/matrix-test.ts). Aria snapshots are
    // OS-independent text and live outside the pixel snapshotDir.
    {
      name: 'chromium-matrix',
      use: devices['Desktop Chrome'],
      testMatch: /specs\/matrix\/(?!visual).*\.spec\.ts/,
      fullyParallel: true,
      snapshotPathTemplate: './aria-snapshots/chromium/{arg}{ext}',
    },
    {
      name: 'firefox-matrix',
      use: devices['Desktop Firefox'],
      testMatch: /specs\/matrix\/(?!visual).*\.spec\.ts/,
      grep: /@smoke/,
      fullyParallel: true,
      snapshotPathTemplate: './aria-snapshots/firefox/{arg}{ext}',
    },
    {
      name: 'webkit-matrix',
      use: devices['Desktop Safari'],
      testMatch: /specs\/matrix\/(?!visual).*\.spec\.ts/,
      grep: /@smoke/,
      fullyParallel: true,
      snapshotPathTemplate: './aria-snapshots/webkit/{arg}{ext}',
    },
    // Visual: pixel snapshots of visual-flagged scenarios, all browsers.
    {
      name: 'chromium-visual',
      use: devices['Desktop Chrome'],
      testMatch: /specs\/matrix\/visual\.spec\.ts/,
      fullyParallel: true,
      snapshotPathTemplate: '{snapshotDir}/chromium-matrix/{arg}{ext}',
    },
    {
      name: 'firefox-visual',
      use: devices['Desktop Firefox'],
      testMatch: /specs\/matrix\/visual\.spec\.ts/,
      fullyParallel: true,
      snapshotPathTemplate: '{snapshotDir}/firefox-matrix/{arg}{ext}',
    },
    {
      name: 'webkit-visual',
      use: devices['Desktop Safari'],
      testMatch: /specs\/matrix\/visual\.spec\.ts/,
      fullyParallel: true,
      snapshotPathTemplate: '{snapshotDir}/webkit-matrix/{arg}{ext}',
    },
  ],
});
