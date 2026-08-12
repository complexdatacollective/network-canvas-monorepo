import { defineConfig } from 'vitest/config';

import { disableModernAnimationsSetup } from '@codaco/vitest-config/modern/setup-path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // Parallelised with the rest of the workspace's tests in the CI quality
    // job; give jsdom tests headroom under peak runner load, and room for the
    // shared setup's 5s Testing Library wait budget to report first.
    testTimeout: 20_000,
    setupFiles: [disableModernAnimationsSetup],
  },
});
