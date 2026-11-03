import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The tests build the theme in memory and read files; they need no DOM.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
