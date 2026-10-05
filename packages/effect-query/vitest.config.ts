import { defineConfig } from 'vitest/config';

import { disableModernAnimationsSetup } from '@codaco/vitest-config/modern/setup-path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: [disableModernAnimationsSetup],
    // Above the shared setup's 5 s Testing Library wait budget.
    testTimeout: 20_000,
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
  },
});
