import { describe, expect, it } from 'vitest';

import { deriveAttrName, resolveAttrNames } from '../attrNames';

// XML 1.0 (5th edition) production [4a] NameChar, written out one range at a
// time as code points so it shares nothing with the implementation's pattern.
const isNameCharacter = (character: string) => {
  const codePoint = character.codePointAt(0) ?? -1;
  const inRange = (low: number, high: number) =>
    codePoint >= low && codePoint <= high;
  return (
    codePoint === 0x3a ||
    inRange(0x41, 0x5a) ||
    codePoint === 0x5f ||
    inRange(0x61, 0x7a) ||
    inRange(0xc0, 0xd6) ||
    inRange(0xd8, 0xf6) ||
    inRange(0xf8, 0x2ff) ||
    inRange(0x370, 0x37d) ||
    inRange(0x37f, 0x1fff) ||
    inRange(0x200c, 0x200d) ||
    inRange(0x2070, 0x218f) ||
    inRange(0x2c00, 0x2fef) ||
    inRange(0x3001, 0xd7ff) ||
    inRange(0xf900, 0xfdcf) ||
    inRange(0xfdf0, 0xfffd) ||
    inRange(0x10000, 0xeffff) ||
    codePoint === 0x2d ||
    codePoint === 0x2e ||
    inRange(0x30, 0x39) ||
    codePoint === 0xb7 ||
    inRange(0x300, 0x36f) ||
    inRange(0x203f, 0x2040)
  );
};

const isNmtoken = (value: string) =>
  value.length > 0 && [...value].every(isNameCharacter);

describe('deriveAttrName', () => {
  it.each([
    'name',
    'a.b-c:d_e',
    '0starts-with-a-digit',
    '年齢',
    'Ünïcode',
    'naïve·middle-dot',
    'Фамилия',
    'اسم',
    '😀',
    'combininǵ',
  ])('leaves the valid NMTOKEN %s unchanged', (name) => {
    expect(isNmtoken(name)).toBe(true);
    expect(deriveAttrName(name)).toBe(name);
  });

  it.each([
    ['Full name', 'Full_name'],
    ['年齢 (years)', '年齢__years_'],
    ['a/b', 'a_b'],
    ['a,b', 'a_b'],
    ['say "hi"', 'say__hi_'],
    ['R&D <team>', 'R_D__team_'],
    ['100%', '100_'],
    ['2 × 3', '2___3'],
    ['a b', 'a_b'],
    ['😀 smile', '😀_smile'],
    ['\ud800', '_'],
  ])('replaces what an NMTOKEN cannot hold: %s', (name, derived) => {
    expect(deriveAttrName(name)).toBe(derived);
  });

  it('always produces a valid NMTOKEN, and is stable when applied again', () => {
    for (const name of [
      'Full name',
      '年齢 (years)',
      '{[(<&>)]}',
      '\\ / | ? * ^ $ # @ ! ~ ` \' " ; = +',
      'tab\there',
      '\u0000￾￿',
      '𠀀 rare ideograph',
    ]) {
      const derived = deriveAttrName(name);

      expect(isNmtoken(derived)).toBe(true);
      expect(deriveAttrName(derived)).toBe(derived);
    }
  });
});

describe('resolveAttrNames', () => {
  const key = (
    name: string,
    target: 'graph' | 'node' | 'edge' | 'all' = 'node',
    builtIn = false,
  ) => ({ name, target, builtIn });
  const namesOf = (keys: ReturnType<typeof key>[]) => {
    const resolved = resolveAttrNames(keys);
    return keys.map((each) => resolved.get(each));
  };

  it('keeps valid names as they are', () => {
    expect(namesOf([key('name'), key('年齢'), key('a.b')])).toEqual([
      'name',
      '年齢',
      'a.b',
    ]);
  });

  it('derives a name for the rest', () => {
    expect(namesOf([key('Full name'), key('年齢 (years)')])).toEqual([
      'Full_name',
      '年齢__years_',
    ]);
  });

  it('tells apart names that derive the same attr.name', () => {
    expect(namesOf([key('a b'), key('a?b'), key('a/b')])).toEqual([
      'a_b',
      'a_b_2',
      'a_b_3',
    ]);
  });

  it('lets a name that is already valid keep it, wherever it comes in the order', () => {
    expect(namesOf([key('a b'), key('a_b')])).toEqual(['a_b_2', 'a_b']);
    expect(namesOf([key('a_b'), key('a b')])).toEqual(['a_b', 'a_b_2']);
  });

  it('does not number a suffix that is another name', () => {
    expect(namesOf([key('a b'), key('a?b'), key('a_b_2')])).toEqual([
      'a_b',
      'a_b_3',
      'a_b_2',
    ]);
  });

  it('shares one attr.name between keys with the very same name', () => {
    expect(namesOf([key('Full name'), key('Full name'), key('a?b')])).toEqual([
      'Full_name',
      'Full_name',
      'a_b',
    ]);
  });

  it('lets keys for different elements share a derived name', () => {
    expect(namesOf([key('a b', 'node'), key('a?b', 'edge')])).toEqual([
      'a_b',
      'a_b',
    ]);
    expect(namesOf([key('a b', 'node'), key('a?b', 'graph')])).toEqual([
      'a_b',
      'a_b',
    ]);
  });

  it('keeps a key that is for every element apart from every other, but not nodes from edges', () => {
    expect(
      namesOf([key('a b', 'all'), key('a?b', 'node'), key('a*b', 'edge')]),
    ).toEqual(['a_b', 'a_b_2', 'a_b_2']);
  });

  it("keeps built-in keys' names, and moves a variable that has one", () => {
    const builtIn = key('label', 'all', true);
    const variable = key('label', 'node');
    const other = key('label_2', 'node');

    const resolved = resolveAttrNames([builtIn, variable, other]);

    expect(resolved.get(builtIn)).toBe('label');
    expect(resolved.get(other)).toBe('label_2');
    expect(resolved.get(variable)).toBe('label_3');
  });

  it('does not depend on the order of a built-in key among the others', () => {
    const builtIn = key('label', 'all', true);
    const variable = key('label', 'edge');

    const resolved = resolveAttrNames([variable, builtIn]);

    expect(resolved.get(builtIn)).toBe('label');
    expect(resolved.get(variable)).toBe('label_2');
  });
});
