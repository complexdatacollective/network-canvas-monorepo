import { defineConfig } from '@playwright/test';

import base from './playwright.config.js';

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: 'http://localhost:4361' },
  webServer: {
    command:
      'pnpm --filter @codaco/architect exec vite preview --port 4361 --strictPort',
    port: 4361,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
