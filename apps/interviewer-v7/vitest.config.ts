/// <reference types="vitest" />

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    include: [
      'src/**/*.test.{ts,tsx}',
      'src/**/__tests__/**/*.{ts,tsx}',
      'electron/**/*.test.{ts,tsx}',
      'electron/**/__tests__/**/*.{ts,tsx}',
    ],
  },
});
