import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';

import { disableModernAnimationsSetup } from '@codaco/vitest-config/modern/setup-path';

// Server prompts are Markdown files imported as strings (src/server/prompts).
const markdownText: Plugin = {
  name: 'sketch-markdown-text',
  enforce: 'pre',
  transform: (code, id) =>
    id.endsWith('.md')
      ? { code: `export default ${JSON.stringify(code)};`, map: null }
      : undefined,
};

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [markdownText, react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'netlify/**/*.test.ts'],
    setupFiles: [disableModernAnimationsSetup],
    testTimeout: 20_000,
  },
});
