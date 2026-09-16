import { clsx } from 'clsx';
import { defineConfig } from 'cva/config';
import { twMerge } from 'tailwind-merge';

export const { cva, cx, compose } = defineConfig({
  cx: (...inputs) => twMerge(clsx(inputs)),
});

export type { VariantProps } from 'cva';
