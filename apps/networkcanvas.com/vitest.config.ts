/// <reference types="vitest" />

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    // Parallelised with the rest of the workspace's tests in the CI quality
    // job; a borderline jsdom test can be starved past the 5s default under
    // peak runner load, so give generous headroom.
    testTimeout: 20_000,
    setupFiles: ['./vitest.setup.ts'],
    server: {
      deps: {
        inline: [/next-intl/],
      },
    },
    include: [
      'app/**/__tests__/**/*.{ts,tsx}',
      'components/**/__tests__/**/*.{ts,tsx}',
      'lib/**/__tests__/**/*.{ts,tsx}',
    ],
  },
});
