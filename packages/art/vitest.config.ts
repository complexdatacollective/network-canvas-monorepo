/// <reference types="vitest" />

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [
      '../fresco-ui/vitest.setup.disable-animations.ts',
      './src/__tests__/setup.ts',
    ],
  },
});
