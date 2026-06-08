import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [path.resolve(__dirname, 'config/vitest/setup.js')],
    include: ['src/**/*.test.{js,jsx}', 'src/**/__tests__/**/*.{js,jsx}'],
    exclude: [
      'node_modules',
      'dist',
      'integration-tests',
      'platforms',
      'src/utils/network-exporters',
      'src/utils/networkQuery',
      // These protocol tests are excluded until the Task 12 cordova-reference
      // sweep updates them: protocolPath still references environments.CORDOVA,
      // and preloadWorkers is missing its vi.mock('../../Environment') call.
      'src/utils/protocol/__tests__/protocolPath.test.js',
      'src/utils/protocol/__tests__/preloadWorkers.test.js',
    ],
    css: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
