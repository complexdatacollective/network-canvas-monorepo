import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// One suite covering both halves of the app: server tests run in the default
// node environment; client component tests opt into jsdom with a
// `@vitest-environment jsdom` docblock.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./client/src/test-setup.ts'],
    include: [
      'client/src/**/*.test.{ts,tsx}',
      'client/src/**/__tests__/**/*.{ts,tsx}',
      'server/src/**/*.test.ts',
      'server/src/**/__tests__/**/*.ts',
      'shared/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
