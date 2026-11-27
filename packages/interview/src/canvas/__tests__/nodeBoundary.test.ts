import { describe, expect, it } from 'vitest';

import { nodeBoundaryDistance } from '../nodeBoundary';

describe('nodeBoundaryDistance', () => {
  it.each(['circle', 'square', 'diamond'])(
    'gives a finite reach for a %s when the direction has no length',
    (shape) => {
      expect(Number.isFinite(nodeBoundaryDistance(shape, 20, 0, 0))).toBe(true);
    },
  );
});
