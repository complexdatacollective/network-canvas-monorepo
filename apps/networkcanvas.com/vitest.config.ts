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
