/// <reference types="vitest" />

import { defineConfig } from 'vitest/config';

// src/index.test.mjs is deliberately run twice: here as this worker's own
// suite, and again through scripts/studio/studio-managed-estate.test.mjs,
// which pulls the managed-estate controls into the required CI script suite.
export default defineConfig({
  test: {
    disableConsoleIntercept: true,
    include: ['src/**/*.test.mjs'],
  },
});
