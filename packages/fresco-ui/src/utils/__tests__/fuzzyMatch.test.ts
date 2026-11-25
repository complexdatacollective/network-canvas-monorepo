import { describe, expect, it } from 'vitest';

import { fuzzyFilter, fuzzyMatchScore } from '../fuzzyMatch';

const NAMES = [
  'age',
  'close_friend',
  'closeness',
  'first_met',
  'lives_nearby',
  'married',
  'name',
  'relationship',
];

const byName = (search: string) =>
  fuzzyFilter(NAMES, search, (name) => name, 'en');

describe('fuzzyMatchScore', () => {
  it('finds a word from an abbreviation of it', () => {
    expect(fuzzyMatchScore('mrd', 'married')).toBeDefined();
    expect(fuzzyMatchScore('cls', 'close_friend')).toBeDefined();
    expect(fuzzyMatchScore('cls', 'closeness')).toBeDefined();
    expect(fuzzyMatchScore('lvn', 'lives_nearby')).toBeDefined();
  });

  it('needs the characters in the order they are typed', () => {
    expect(fuzzyMatchScore('dm', 'married')).toBeUndefined();
    expect(fuzzyMatchScore('xyz', 'married')).toBeUndefined();
  });

  it('ignores case and accents', () => {
    expect(fuzzyMatchScore('MRD', 'married')).toBeDefined();
    expect(fuzzyMatchScore('cafe', 'Café_visits')).toBe(0);
  });

  it('scores text that contains the whole search below any other match', () => {
    const contained = fuzzyMatchScore('near', 'lives_nearby');
    const abbreviated = fuzzyMatchScore('lvn', 'lives_nearby');
    expect(contained).toBeLessThan(1);
    expect(abbreviated).toBeGreaterThanOrEqual(1);
  });

  it('prefers characters at the start of a word to characters after a gap', () => {
    // "c" then "f" at the start of "friend", against "c" then an "f" that
    // follows a run of other characters.
    const atWordStart = fuzzyMatchScore('cf', 'close_friend');
    const afterGap = fuzzyMatchScore('cf', 'coffee');
    expect(atWordStart).toBeLessThan(afterGap ?? Number.POSITIVE_INFINITY);
  });

  it('matches everything with an empty search', () => {
    expect(fuzzyMatchScore('', 'anything')).toBe(0);
    expect(fuzzyMatchScore('   ', 'anything')).toBe(0);
  });
});

describe('fuzzyFilter', () => {
  it('keeps only the items that match, best match first', () => {
    expect(byName('mrd')).toEqual(['married']);
    expect(byName('cls')).toEqual(['close_friend', 'closeness']);
    expect(byName('na')[0]).toBe('name');
  });

  it('keeps the given order for items that match equally well', () => {
    expect(byName('close')).toEqual(['close_friend', 'closeness']);
  });

  it('returns every item, in order, for an empty search', () => {
    expect(byName('')).toEqual(NAMES);
  });

  it('returns nothing when nothing matches', () => {
    expect(byName('qqq')).toEqual([]);
  });
});
