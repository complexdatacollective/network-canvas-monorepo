import { describe, expect, it } from 'vitest';

import { createHeroEntrance } from '../heroEntrance';

describe('createHeroEntrance', () => {
  it('uses ordered spring entrances for normal motion', () => {
    expect(createHeroEntrance(false)).toMatchObject({
      initial: 'hidden',
      pageVariants: {
        visible: { transition: { staggerChildren: 0.16 } },
      },
      heroVariants: {
        visible: { transition: { staggerChildren: 0.12 } },
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
      initial: false,
      pageVariants: {
        hidden: {},
        visible: { transition: { staggerChildren: 0 } },
      },
      heroVariants: {
        hidden: {},
        visible: { transition: { staggerChildren: 0 } },
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
