import { describe, expect, it } from 'vitest';

import { createHeroEntrance } from '../heroEntrance';

describe('createHeroEntrance', () => {
  it('moves items in from an offset, and keeps translucent surfaces fully opaque', () => {
    const entrance = createHeroEntrance(false);

    expect(entrance.initial).toBe('hidden');
    expect(entrance.itemVariants.hidden).toMatchObject({ opacity: 0, y: 16 });
    expect(entrance.itemVariants.visible).toMatchObject({ opacity: 1, y: 0 });
    // Opacity below 1 would form a Backdrop Root and stop the surface sampling the page.
    expect(entrance.backdropItemVariants.hidden).toMatchObject({
      opacity: 1,
      visibility: 'hidden',
      y: 16,
    });
    expect(entrance.backdropItemVariants.visible).toMatchObject({
      opacity: 1,
      visibility: 'visible',
      y: 0,
    });
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
      const visible = variants.visible;
      if (visible === undefined || typeof visible === 'function') {
        throw new Error('Expected a static visible variant');
      }
      const { transition, ...visibleState } = visible;
      expect(transition).toEqual({ duration: 0 });
      expect(variants.hidden).toEqual(visibleState);
    }
  });
});
