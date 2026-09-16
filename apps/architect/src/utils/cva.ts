import { clsx } from 'clsx';
import { defineConfig } from 'cva/config';
import { twMerge } from 'tailwind-merge';

const config = defineConfig({
  cx: (...inputs) => twMerge(clsx(inputs)),
});

export const { cva, cx } = config;
export type { VariantProps } from 'cva';
