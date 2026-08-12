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
    setupFiles: [disableModernAnimationsSetup, './vitest.setup.ts'],
    include: [
      'components/**/__tests__/**/*.{ts,tsx}',
      'lib/**/__tests__/**/*.{ts,tsx}',
    ],
  },
});
