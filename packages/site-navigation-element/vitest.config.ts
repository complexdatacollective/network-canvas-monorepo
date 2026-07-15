import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

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
