import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Universal modules are tested under node (invariant: no browser globals
    // at module scope); React tests opt into jsdom per-file via docblock.
    environment: 'node',
  },
});
