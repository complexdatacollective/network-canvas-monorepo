import type { Variants } from 'motion/react';
import { describe, expect, it } from 'vitest';

import { createHeroEntrance } from '../heroEntrance';

function staticVariant(variants: Variants, name: 'hidden' | 'visible') {
  const variant = variants[name];
  if (variant === undefined || typeof variant === 'function') {
    throw new Error(`Expected a static ${name} variant`);
  }
  return variant;
}

describe('createHeroEntrance', () => {
  it('enters the hero after the header, one item at a time, each moving in from an offset', () => {
    const entrance = createHeroEntrance(false);

    expect(entrance.initial).toBe('hidden');
    const { transition } = staticVariant(entrance.heroVariants, 'visible');
    expect(transition?.delayChildren).toBeGreaterThan(0);
    expect(transition?.staggerChildren).toBeGreaterThan(0);

    const itemHidden = staticVariant(entrance.itemVariants, 'hidden');
    const itemVisible = staticVariant(entrance.itemVariants, 'visible');
    expect(itemHidden.y).not.toBe(itemVisible.y);
    expect(Number(itemHidden.opacity)).toBeLessThan(
      Number(itemVisible.opacity),
    );

    // Opacity below 1 would form a Backdrop Root and stop the surface sampling the page.
    const backdropHidden = staticVariant(
      entrance.backdropItemVariants,
      'hidden',
    );
    const backdropVisible = staticVariant(
      entrance.backdropItemVariants,
      'visible',
    );
    expect(backdropHidden.y).not.toBe(backdropVisible.y);
    expect(backdropHidden.opacity).toBe(1);
    expect(backdropVisible.opacity).toBe(1);
    expect(backdropHidden.visibility).toBe('hidden');
    expect(backdropVisible.visibility).toBe('visible');
  });

  it('starts every item in its final state with no delay or duration for reduced motion', () => {
    const entrance = createHeroEntrance(true);

    expect(entrance.initial).toBe(false);
    expect(entrance.heroVariants.visible).toEqual({
      transition: { delayChildren: 0, staggerChildren: 0 },
    });
    for (const variants of [
      entrance.itemVariants,
      entrance.backdropItemVariants,
    ]) {
      const { transition, ...visibleState } = staticVariant(
        variants,
        'visible',
      );
      expect(transition).toEqual({ duration: 0 });
      expect(variants.hidden).toEqual(visibleState);
    }
  });
});
