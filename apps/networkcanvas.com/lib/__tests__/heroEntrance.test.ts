import { describe, expect, it } from 'vitest';

import { createHeroEntrance } from '../heroEntrance';

describe('createHeroEntrance', () => {
  it('uses ordered spring entrances for normal motion', () => {
    expect(createHeroEntrance(false)).toMatchObject({
      initial: 'hidden',
      heroVariants: {
        visible: { transition: { delayChildren: 0.16, staggerChildren: 0.12 } },
      },
      backdropItemVariants: {
        hidden: { opacity: 1, visibility: 'hidden', y: 16 },
        visible: {
          opacity: 1,
          visibility: 'visible',
          y: 0,
          transition: { type: 'spring', stiffness: 100, damping: 20 },
        },
      },
      itemVariants: {
        hidden: { opacity: 0, y: 16 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { type: 'spring', stiffness: 100, damping: 20 },
        },
      },
    });
  });

  it('removes initial transforms and delays for reduced motion', () => {
    expect(createHeroEntrance(true)).toEqual({
      backdropItemVariants: {
        hidden: { opacity: 1, visibility: 'visible', y: 0 },
        visible: {
          opacity: 1,
          visibility: 'visible',
          y: 0,
          transition: { duration: 0 },
        },
      },
      initial: false,
      heroVariants: {
        hidden: {},
        visible: { transition: { delayChildren: 0, staggerChildren: 0 } },
      },
      itemVariants: {
        hidden: { opacity: 1, y: 0 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0 },
        },
      },
    });
  });
});
