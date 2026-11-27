import { describe, expect, it, vi } from 'vitest';

import { boundedCache } from '../bounded-cache.ts';

describe('boundedCache', () => {
  it('computes each key once while it is kept', () => {
    const compute = vi.fn((key: string) => key.length);
    const read = boundedCache(2, compute);

    expect(read('one')).toBe(3);
    expect(read('one')).toBe(3);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('keeps a result that is undefined', () => {
    const compute = vi.fn((_key: string): undefined => undefined);
    const read = boundedCache(2, compute);

    read('one');
    read('one');
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('keeps at most `limit` results, forgetting the one read longest ago', () => {
    const compute = vi.fn((key: string) => key.length);
    const read = boundedCache(2, compute);

    read('a');
    read('b');
    // Reading `a` again makes `b` the one read longest ago.
    read('a');
    read('c');
    expect(compute).toHaveBeenCalledTimes(3);

    read('a');
    expect(compute).toHaveBeenCalledTimes(3);
    read('b');
    expect(compute).toHaveBeenCalledTimes(4);
  });

  it('refuses a limit that keeps nothing', () => {
    expect(() => boundedCache(0, String)).toThrow(RangeError);
  });
});
