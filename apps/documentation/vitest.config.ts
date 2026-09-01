/// <reference types="vitest" />

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import { disableModernAnimationsSetup } from '@codaco/vitest-config/modern/setup-path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    // Parallelised with the rest of the workspace's tests in the CI quality
    // job; give jsdom tests headroom under peak runner load, and room for the
    // shared setup's 5s Testing Library wait budget to report first.
    testTimeout: 20_000,
    setupFiles: [disableModernAnimationsSetup, './vitest.setup.ts'],
    include: [
      'components/**/__tests__/**/*.{ts,tsx}',
      'lib/**/__tests__/**/*.{ts,tsx}',
    ],
  },
});
