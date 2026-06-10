import type { ComponentType } from 'react';
import { useMemo } from 'react';

import { seedToRng } from './seed';
import {
  PATTERN_VARIANTS,
  type PatternProps,
  type PatternVariant,
} from './types';
import { CrossesPattern } from './variants/Crosses';
import { DotsPattern } from './variants/Dots';
import { FlowPattern } from './variants/Flow';
import { RingsPattern } from './variants/Rings';
import { SquigglesPattern } from './variants/Squiggles';
import { TilesPattern } from './variants/Tiles';
import { TruchetPattern } from './variants/Truchet';

const componentByVariant: Record<
  PatternVariant,
  ComponentType<PatternProps>
> = {
  dots: DotsPattern,
  tiles: TilesPattern,
  flow: FlowPattern,
  rings: RingsPattern,
  crosses: CrossesPattern,
  squiggles: SquigglesPattern,
  truchet: TruchetPattern,
};

// Background for the empty-seed state. Uses the fresco theme's platinum-dark
// primitive when rendered inside a themed app; the literal fallback is the
// same oklch triple for consumers without the theme.
const EMPTY_SEED_BACKGROUND = 'oklch(var(--platinum--dark, 0.9093 0.009 281))';

export const Pattern = ({
  seed,
  variant,
  className,
  style,
  ...rest
}: PatternProps & { variant?: PatternVariant }) => {
  const resolvedVariant = useMemo<PatternVariant>(() => {
    if (variant) return variant;
    const rng = seedToRng(`${seed}::variant`);
    return (
      PATTERN_VARIANTS[Math.floor(rng() * PATTERN_VARIANTS.length)] ?? 'dots'
    );
  }, [seed, variant]);

  // No seed yet (e.g. a protocol card still loading): render a plain
  // platinum-dark surface instead of a generated pattern.
  if (seed === '') {
    return (
      <div
        role="presentation"
        className={className}
        style={{ ...style, background: EMPTY_SEED_BACKGROUND }}
      />
    );
  }

  const Component = componentByVariant[resolvedVariant];
  return (
    <Component seed={seed} className={className} style={style} {...rest} />
  );
};
