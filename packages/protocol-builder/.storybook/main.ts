import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineMain } from '@storybook/react-vite/node';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

export default defineMain({
  addons: [
    getAbsolutePath('@storybook/addon-docs'),
    getAbsolutePath('@storybook/addon-a11y'),
    getAbsolutePath('@storybook/addon-mcp'),
  ],
  framework: {
    name: getAbsolutePath('@storybook/react-vite'),
    options: {},
  },
  stories: ['../src/**/*.stories.tsx'],
  typescript: { check: false },
  viteFinal: async (config) => {
    config.plugins = [...(config.plugins ?? []), react(), tailwindcss()];
    return config;
  },
});

function getAbsolutePath(value: string): string {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}
