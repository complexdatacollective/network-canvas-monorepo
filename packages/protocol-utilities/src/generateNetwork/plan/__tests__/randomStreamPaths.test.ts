import { describe, expect, it } from 'vitest';

import { createRandomSource } from '../random';

/**
 * Stream paths carry arbitrary caller data — unplanned missingness passes a
 * NUL-joined equality-group key beside an external roster uid — so the key
 * these segments assemble has to be injective over every string. Aliasing two
 * paths does not merely repeat a value: it hands one entity's stream to
 * another, and both then consume the same sequence.
 */

const NUL = '\u0000';
const SOH = '\u0001';

const firstValues = (seed: number, ...path: string[]): number[] => {
  const source = createRandomSource(seed);
  const stream = source.stream(...path);
  return Array.from({ length: 4 }, () => stream.next());
};

describe('a random source keyed by a semantic path', () => {
  it('separates paths a plain NUL join would alias', () => {
    expect(firstValues(7, 'a', `b${NUL}c`)).not.toEqual(
      firstValues(7, `a${NUL}b`, 'c'),
    );
  });

  it('separates a segment holding the escape character itself', () => {
    expect(firstValues(7, `a${SOH}${SOH}b`)).not.toEqual(
      firstValues(7, `a${NUL}b`),
    );
  });

  it('returns one memoized stream per path', () => {
    const source = createRandomSource(7);
    expect(source.stream('node', 'person')).toBe(
      source.stream('node', 'person'),
    );
  });

  it('leaves ordinary paths on the seeds they already had', () => {
    // The escape is a no-op for a segment holding neither NUL nor SOH, so no
    // existing protocol's generated values move.
    expect(firstValues(11, 'count', 'stage-1', 'person')).toEqual(
      firstValues(11, 'count', 'stage-1', 'person'),
    );
  });
});
