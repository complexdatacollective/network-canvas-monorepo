import { defineConfig } from 'vitest/config';

import { disableModernAnimationsSetup } from '@codaco/vitest-config/modern/setup-path';

export default defineConfig({
  test: {
    // The adapter's hooks render through @testing-library/react.
    environment: 'jsdom',
    // Every Testing Library workspace loads the shared setup that disables
    // Motion animations, pinned by scripts/buildtime/vitest-animation-setup.test.mjs.
    setupFiles: [disableModernAnimationsSetup],
    // Above the shared setup's 5 s Testing Library wait budget, as that guard
    // requires of every project loading it.
    testTimeout: 20_000,
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
  },
});
