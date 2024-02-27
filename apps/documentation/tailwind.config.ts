import type { Config } from 'tailwindcss';
import sharedConfig from '@acme/tailwind-config/fresco';

const config: Pick<
  Config,
  'content' | 'darkMode' | 'presets' | 'plugins' | 'theme'
> = {
  darkMode: ['class'],
  content: [
    ...sharedConfig.content,
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/**/*.{ts,tsx}', // UI package
  ],
  presets: [sharedConfig],
  plugins: [require('@tailwindcss/typography')],
};

export default config;
