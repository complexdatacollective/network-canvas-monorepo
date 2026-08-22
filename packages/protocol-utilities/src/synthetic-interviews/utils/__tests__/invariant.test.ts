import { describe, expect, it } from 'vitest';

import { invariant } from '../invariant';

describe('invariant', () => {
  it('lets a satisfied assumption through', () => {
    expect(() =>
      invariant(true, 'a codebook entity the stage names'),
    ).not.toThrow();
  });

  it('throws when the assumption does not hold', () => {
    expect(() => invariant(false, 'a codebook entity the stage names')).toThrow(
      Error,
    );
  });

  it('names generation in the message, so the failure is legible', () => {
    // The prefix is the point: a violated assumption must read as "generation
    // cannot proceed because X", not as a bare TypeError from deep inside a
    // draw.
    expect(() => invariant(false, 'quickAdd names no text variable')).toThrow(
      'Cannot generate a synthetic interview: quickAdd names no text variable',
    );
  });
});
