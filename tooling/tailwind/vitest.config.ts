import { defineConfig } from 'vitest/config';

import { disableModernAnimationsSetup } from '@codaco/vitest-config/modern/setup-path';

export default defineConfig({
  test: {
    // The theme tests read CSS from disk and compute colours; they need no DOM.
    environment: 'node',
    // This package depends on Motion, so its tests load the shared animation
    // setup like every other Motion workspace (see
    // scripts/buildtime/vitest-animation-setup.test.mjs).
    setupFiles: [disableModernAnimationsSetup],
    // The shared setup's 5s async wait budget needs room to report first.
    testTimeout: 20_000,
  },
});
