import { describe, expect, it } from 'vitest';

import { neutralizeCsvFormula, toGraphMLAttrName } from '../export-text.ts';

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

describe('toGraphMLAttrName', () => {
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
    expect(toGraphMLAttrName(name)).toBe(name);
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
    expect(toGraphMLAttrName(name)).toBe(derived);
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
      const derived = toGraphMLAttrName(name);

      expect(isNmtoken(derived)).toBe(true);
      expect(toGraphMLAttrName(derived)).toBe(derived);
    }
  });
});

describe('neutralizeCsvFormula', () => {
  it.each(['=total', '+1', '-score', '@handle', '\tindented', '\rreturn'])(
    'puts an apostrophe before %j, which a spreadsheet would read as a formula',
    (value) => {
      expect(neutralizeCsvFormula(value)).toBe(`'${value}`);
    },
  );

  it.each(['close friend', 'a=b+c', "'=total", '友人', ''])(
    'leaves %j as it is',
    (value) => {
      expect(neutralizeCsvFormula(value)).toBe(value);
    },
  );
});
