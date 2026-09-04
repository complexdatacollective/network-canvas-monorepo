import { defineConfig } from 'vitest/config';

import { disableModernAnimationsSetup } from '@codaco/vitest-config/modern/setup-path';

export default defineConfig({
  test: {
    // Universal modules are tested under node (invariant: no browser globals
    // at module scope); React tests opt into jsdom per-file via docblock.
    environment: 'node',
    // The workspace-wide Testing Library setup: animations off, and the 5s
    // async wait budget that keeps a `waitFor` from failing against a
    // half-rendered DOM under CI load. It touches no browser global at module
    // scope, so it loads cleanly under the node environment above.
    setupFiles: [disableModernAnimationsSetup],
    // Room for that 5s wait budget to report the real failure first, under a
    // CI job running the whole workspace's tests at once.
    testTimeout: 20_000,
  },
});
