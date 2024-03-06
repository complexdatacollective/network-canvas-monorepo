import type { Config } from 'tailwindcss';
import sharedConfig from '@acme/tailwind-config/fresco';

const config: Pick<
  Config,
  'content' | 'darkMode' | 'presets' | 'plugins' | 'theme'
> = {
  darkMode: ['class'],
  content: [
    ...sharedConfig.content,
    './lib/**/*.{ts,tsx}', // For JSX components in MD
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    '../../packages/ui/**/*.{ts,tsx}', // UI package
  ],
  presets: [sharedConfig],
};

export default config;
