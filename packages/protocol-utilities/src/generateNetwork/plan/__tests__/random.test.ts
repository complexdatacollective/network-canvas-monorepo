import { describe, expect, it } from 'vitest';

import { createRandomSource } from '../random';

const draws = (
  source: ReturnType<typeof createRandomSource>,
  path: (string | number)[],
  count: number,
): number[] =>
  Array.from({ length: count }, () => source.stream(...path).next());

describe('createRandomSource', () => {
  it('replays identical sequences for the same seed and path', () => {
    const a = createRandomSource(42);
    const b = createRandomSource(42);
    expect(draws(a, ['count', 'person'], 10)).toEqual(
      draws(b, ['count', 'person'], 10),
    );
  });

  it('derives different sequences for different seeds', () => {
    const a = createRandomSource(1);
    const b = createRandomSource(2);
    expect(draws(a, ['x'], 5)).not.toEqual(draws(b, ['x'], 5));
  });

  it('derives different sequences for different paths', () => {
    const source = createRandomSource(7);
    expect(draws(source, ['variable', 'age'], 5)).not.toEqual(
      draws(source, ['variable', 'name'], 5),
    );
  });

  it('isolates streams: draws on one path never perturb another', () => {
    const interleaved = createRandomSource(99);
    const first = draws(interleaved, ['x'], 5);
    draws(interleaved, ['y'], 3); // unrelated consumption
    const second = draws(interleaved, ['x'], 5);

    const straight = createRandomSource(99);
    expect([...first, ...second]).toEqual(draws(straight, ['x'], 10));
  });

  it('memoises streams so the same path continues its sequence', () => {
    const source = createRandomSource(5);
    expect(source.stream('a', 1)).toBe(source.stream('a', 1));
    const once = createRandomSource(5);
    const stream = once.stream('a', 1);
    const expected = [stream.next(), stream.next()];
    const again = createRandomSource(5);
    expect([again.stream('a', 1).next(), again.stream('a', 1).next()]).toEqual(
      expected,
    );
  });

  it('draws integers inclusively across the range', () => {
    const stream = createRandomSource(3).stream('int');
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const value = stream.int(1, 4);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(4);
      seen.add(value);
    }
    expect(seen).toEqual(new Set([1, 2, 3, 4]));
  });

  it('collapses an inverted integer range to min', () => {
    const stream = createRandomSource(3).stream('int');
    expect(stream.int(5, 2)).toBe(5);
  });

  it('returns the mean for a zero-sd normal draw', () => {
    const stream = createRandomSource(3).stream('normal');
    expect(stream.normal(12, 0)).toBe(12);
  });

  it('owns a deterministic, memoised faker per stream', () => {
    const a = createRandomSource(42).stream('names');
    const b = createRandomSource(42).stream('names');
    expect(a.faker()).toBe(a.faker());
    expect(a.faker().person.firstName()).toBe(b.faker().person.firstName());
  });
});
