import { defineConfig } from '@playwright/test';

import rootConfig from './playwright.config.js';

// The Architect 8 build Architect 9 ships inside its own deploy, served at
// /v8/ (ARCHITECT_BASE_PATH=/v8/, see scripts/buildtime/app-base-path.mjs at
// the repository root). Everything the root suite sets up — the browser,
// service workers blocked, reduced motion, timeouts — carries over; only where
// the app lives changes.
//
// It needs its own build: `dist/` holds one base at a time, so build with
// ARCHITECT_BASE_PATH=/v8/ first (`test:e2e:subpath` does both), and rebuild
// without it before running the root suite again. `subpath-global-setup.ts`
// refuses to run against a root build rather than letting every spec fail on
// missing assets.
const PORT = 4302;

export default defineConfig({
  ...rootConfig,
  testDir: './subpath-specs',
  outputDir: './test-results-subpath',
  globalSetup: './subpath-global-setup.ts',

  reporter: [
    ['line'],
    ['html', { outputFolder: './playwright-report-subpath', open: 'never' }],
    ['json', { outputFile: './test-results-subpath/results.json' }],
  ],

  use: {
    ...rootConfig.use,
    // The trailing slash matters: specs navigate with base-relative URLs
    // (`page.goto('protocol')`), which resolve against this, so they land
    // under /v8/. A root-absolute `page.goto('/protocol')` would leave it.
    baseURL: `http://localhost:${PORT}/v8/`,
  },

  webServer: {
    // vite preview reads the base from the same variable as the build, so it
    // serves dist/ at /v8/ (and its SPA fallback answers /v8/<deep link>).
    // Another port than the root suite's, so a root preview server left
    // running (reuseExistingServer) is never mistaken for this one.
    command: `pnpm --filter @codaco/architect exec vite preview --port ${PORT} --strictPort`,
    env: { ARCHITECT_BASE_PATH: '/v8/' },
    url: `http://localhost:${PORT}/v8/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
