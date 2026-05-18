import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Pattern } from '../Pattern';
import { PATTERN_VARIANTS, type PatternVariant } from '../types';
import { CrossesPattern } from '../variants/Crosses';
import { DotsPattern } from '../variants/Dots';
import { FlowPattern } from '../variants/Flow';
import { RingsPattern } from '../variants/Rings';
import { SquigglesPattern } from '../variants/Squiggles';
import { TilesPattern } from '../variants/Tiles';
import { TruchetPattern } from '../variants/Truchet';

// The substring each variant's foreground emits, used as a sanity check that
// the right primitive renders. Variants that share a primitive (Dots/Rings →
// <circle>, Flow/Squiggles/Truchet → <path>) share an entry.
const expectedPrimitiveForVariant: Record<PatternVariant, string> = {
  dots: '<circle',
  tiles: '<polygon',
  flow: '<path',
  rings: '<circle',
  squiggles: '<path',
  crosses: '<line',
  truchet: '<path',
};

const VARIANT_CASES = [
  { name: 'DotsPattern', Comp: DotsPattern, variant: 'dots' },
  { name: 'TilesPattern', Comp: TilesPattern, variant: 'tiles' },
  { name: 'FlowPattern', Comp: FlowPattern, variant: 'flow' },
  { name: 'RingsPattern', Comp: RingsPattern, variant: 'rings' },
  { name: 'SquigglesPattern', Comp: SquigglesPattern, variant: 'squiggles' },
  { name: 'CrossesPattern', Comp: CrossesPattern, variant: 'crosses' },
  { name: 'TruchetPattern', Comp: TruchetPattern, variant: 'truchet' },
] as const satisfies ReadonlyArray<{
  name: string;
  Comp: typeof DotsPattern;
  variant: PatternVariant;
}>;

describe('determinism', () => {
  describe.each(VARIANT_CASES)('$name', ({ Comp, variant }) => {
    const expectedShape = expectedPrimitiveForVariant[variant];

    it('produces identical markup on repeat renders with the same seed', () => {
      const a = renderToStaticMarkup(
        <Comp seed="fixture" width={400} height={250} />,
      );
      const b = renderToStaticMarkup(
        <Comp seed="fixture" width={400} height={250} />,
      );
      expect(a).toBe(b);
    });

    it('renders an svg with the expected shape primitives', () => {
      const markup = renderToStaticMarkup(
        <Comp seed="fixture" width={400} height={250} />,
      );
      expect(markup.startsWith('<svg')).toBe(true);
      expect(markup).toContain('<rect');
      expect(markup).toContain(expectedShape);
    });

    it('matches snapshot for the determinism fixture seed', () => {
      const markup = renderToStaticMarkup(
        <Comp seed="determinism-fixture" width={400} height={250} />,
      );
      expect(markup).toMatchSnapshot();
    });
  });

  describe('Pattern dispatcher', () => {
    it('produces identical markup on repeat renders with no variant prop', () => {
      const a = renderToStaticMarkup(
        <Pattern seed="dispatch-fixture" width={400} height={250} />,
      );
      const b = renderToStaticMarkup(
        <Pattern seed="dispatch-fixture" width={400} height={250} />,
      );
      expect(a).toBe(b);
    });

    it.each(PATTERN_VARIANTS)(
      'routes the explicit %s variant to its component',
      (variant) => {
        const markup = renderToStaticMarkup(
          <Pattern seed="fixture" variant={variant} width={400} height={250} />,
        );
        expect(markup.startsWith('<svg')).toBe(true);
        expect(markup).toContain(expectedPrimitiveForVariant[variant]);
      },
    );
  });
});
