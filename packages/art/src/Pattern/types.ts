import type { CSSProperties, ReactNode } from 'react';

export type Rng = () => number;

export type Palette = {
  foreground: string;
  backgroundTop: string;
  backgroundBottom: string;
};

export type Renderer = (
  rng: Rng,
  palette: Palette,
  width: number,
  height: number,
) => ReactNode;

export const PATTERN_VARIANTS = [
  'dots',
  'tiles',
  'flow',
  'rings',
  'crosses',
  'squiggles',
  'truchet',
] as const;
export type PatternVariant = (typeof PATTERN_VARIANTS)[number];

export type PatternProps = {
  seed: string;
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
};
