/// <reference types="vitest" />

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

import { appI18n } from '@codaco/app-i18n/vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        messages: resolve(__dirname, 'src/messages.ts'),
        locales: resolve(__dirname, 'src/locales/catalogs.ts'),
      },
      name: 'ProtocolUtilities',
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        /^@codaco\/app-i18n(?:\/|$)/,
        '@codaco/network-query',
        '@codaco/protocol-validation',
        '@codaco/shared-consts',
        '@faker-js/faker',
        'es-toolkit',
        'uuid',
      ],
    },
  },
  plugins: [
    appI18n({ build: 'library' }),
    dts({
      insertTypesEntry: true,
    }),
  ],
});
