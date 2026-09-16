import { defineConfig } from 'cva/config';
import { twMerge } from 'tailwind-merge';

export const { cva, cx, compose } = defineConfig({
  cx: (...inputs) => twMerge(inputs),
});

export type { VariantProps } from 'cva';
