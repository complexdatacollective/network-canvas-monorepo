/// <reference types="vitest" />

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/storybook-static/**'],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: ['./src/test-setup.ts'],
          include: [
            'src/**/*.test.{ts,tsx}',
            'src/**/__tests__/**/*.{ts,tsx}',
            'electron/**/*.test.{ts,tsx}',
            'electron/**/__tests__/**/*.{ts,tsx}',
          ],
          exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/*.stories.{ts,tsx}',
          ],
        },
      },
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: resolve(here, '.storybook'),
            storybookScript: 'storybook dev -p 6006 --no-open',
          }),
        ],
        test: {
          name: 'storybook',
          testTimeout: 60_000,
          browser: {
            provider: playwright(),
            enabled: true,
            instances: [{ browser: 'chromium' }],
            headless: true,
          },
          exclude: ['**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
