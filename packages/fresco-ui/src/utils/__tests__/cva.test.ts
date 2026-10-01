import { describe, expect, expectTypeOf, it } from 'vitest';

import { compose, cva } from '../cva';

const box = cva({
  base: 'block',
  variants: { pad: { sm: 'p-1', lg: 'p-4' } },
  defaultVariants: { pad: 'sm' },
});
const border = cva({
  base: 'border',
  variants: { pad: { sm: 'rounded-sm', lg: 'rounded-lg' } },
  defaultVariants: { pad: 'lg' },
});
const stack = cva({
  base: 'flex',
  variants: { gap: { sm: 'gap-1', lg: 'gap-4' } },
});

describe('deprecated compose', () => {
  it('matches composes when defaults do not conflict', () => {
    const composed = compose(box, stack);
    const viaComposes = cva({ composes: [box, stack] });

    for (const props of [
      undefined,
      {},
      { pad: 'lg' as const },
      { gap: 'sm' as const, className: 'm-2' },
      { pad: undefined, gap: 'lg' as const, class: 'p-8' },
    ]) {
      expect(composed(props)).toBe(viaComposes(props));
    }
  });

  it('lets each component fall back to its own default, as cva beta.10 did', () => {
    expect(compose(box, border)()).toBe('block p-1 border rounded-lg');
    expect(compose(box, border)({ pad: 'sm' })).toBe(
      'block p-1 border rounded-sm',
    );
  });

  it('accepts the union of the composed variant props', () => {
    const composed = compose(box, stack);
    expectTypeOf(composed)
      .parameter(0)
      .exclude<undefined>()
      .toHaveProperty('gap');
    expectTypeOf(composed)
      .parameter(0)
      .exclude<undefined>()
      .toHaveProperty('pad');
  });
});
