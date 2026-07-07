import { defineConfig } from 'cva';
import { twMerge } from 'tailwind-merge';

const config = defineConfig({
  hooks: {
    onComplete: (className) => twMerge(className),
  },
});

export const { cva, cx } = config;
export type { VariantProps } from 'cva';
