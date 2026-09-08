import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import { disableModernAnimationsSetup } from '@codaco/vitest-config/modern/setup-path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: [disableModernAnimationsSetup, './src/account/test-setup.ts'],
    include: ['src/account/**/*.test.{ts,tsx}'],
    testTimeout: 20_000,
  },
});
