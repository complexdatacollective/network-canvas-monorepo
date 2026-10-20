import { describe, expect, it } from 'vitest';

import { elapsedMs, MAX_ELAPSED_MS } from '../elapsed';

describe('elapsedMs', () => {
  it('reports the whole milliseconds between two instants', () => {
    expect(elapsedMs(1_000, 3_500.4)).toBe(2_500);
  });

  it('reports no time when the clock was set back in between', () => {
    expect(elapsedMs(5_000, 1_000)).toBe(0);
  });

  it('caps an elapsed time beyond the catalogued range', () => {
    expect(elapsedMs(0, MAX_ELAPSED_MS * 2)).toBe(MAX_ELAPSED_MS);
  });
});
