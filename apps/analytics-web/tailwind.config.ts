import type { Config } from 'tailwindcss';
import sharedConfig from '@codaco/tailwind-config/fresco';

const config: Pick<Config, 'content' | 'darkMode' | 'presets' | 'plugins'> = {
  content: [
    ...sharedConfig.content,
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}', // UI package
  ],
  presets: [sharedConfig],
};

export default config;
