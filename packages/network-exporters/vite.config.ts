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
        'messages': resolve(__dirname, 'src/messages.ts'),
        'locales': resolve(__dirname, 'src/locales/catalogs.ts'),
        'pipeline': resolve(__dirname, 'src/pipeline.ts'),
        'options': resolve(__dirname, 'src/options.ts'),
        'input': resolve(__dirname, 'src/input.ts'),
        'output': resolve(__dirname, 'src/output.ts'),
        'events': resolve(__dirname, 'src/events.ts'),
        'errors': resolve(__dirname, 'src/errors.ts'),
        'services/InterviewRepository': resolve(
          __dirname,
          'src/services/InterviewRepository.ts',
        ),
        'services/ProtocolRepository': resolve(
          __dirname,
          'src/services/ProtocolRepository.ts',
        ),
        'services/Output': resolve(__dirname, 'src/services/Output.ts'),
        'layers/ZipOutput': resolve(__dirname, 'src/layers/ZipOutput.ts'),
      },
      formats: ['es'],
    },
    rolldownOptions: {
      external: [
        /^@codaco\/app-i18n(?:\/|$)/,
        '@codaco/protocol-validation',
        '@codaco/shared-consts',
        '@xmldom/xmldom',
        'effect',
        'es-toolkit',
        'es-toolkit/compat',
        'fflate',
        'ohash',
        'sanitize-filename',
        'zod',
        'zod/mini',
        /^node:/,
      ],
    },
  },
  plugins: [
    ...appI18n({ build: 'library' }),
    dts({
      insertTypesEntry: false,
      // Multi-entry build: strip `src/` so emitted .d.ts files sit alongside
      // their .js counterparts (dist/foo.d.ts vs dist/src/foo.d.ts).
      entryRoot: 'src',
    }),
  ],
});
