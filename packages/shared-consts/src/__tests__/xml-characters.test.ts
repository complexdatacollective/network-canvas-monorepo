import { describe, expect, it } from 'vitest';

import {
  hasXmlIllegalCharacters,
  stripXmlIllegalCharacters,
  xmlIllegalCodePoints,
} from '../xml-characters.ts';

const character = (codePoint: number) => String.fromCodePoint(codePoint);
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

const KEPT_C0 = [0x9, 0xa, 0xd];
const ILLEGAL_C0 = [...range(0x0, 0x8), 0xb, 0xc, ...range(0xe, 0x1f)];
const ILLEGAL_SURROGATE_HALVES = [0xd800, 0xdbff, 0xdc00, 0xdfff];

describe('hasXmlIllegalCharacters', () => {
  it.each(ILLEGAL_C0)(
    'flags the C0 control with code point %d',
    (codePoint) => {
      expect(hasXmlIllegalCharacters(`a${character(codePoint)}b`)).toBe(true);
    },
  );

  it.each(KEPT_C0)(
    'accepts tab, line feed and carriage return (code point %d)',
    (cp) => {
      expect(hasXmlIllegalCharacters(`a${character(cp)}b`)).toBe(false);
    },
  );

  it.each([0xfffe, 0xffff])(
    'flags the noncharacter with code point %d',
    (codePoint) => {
      expect(hasXmlIllegalCharacters(character(codePoint))).toBe(true);
    },
  );

  it.each([0x7f, ...range(0x80, 0x9f)])(
    'accepts DEL and the C1 controls (code point %d), which XML 1.0 allows',
    (codePoint) => {
      expect(hasXmlIllegalCharacters(character(codePoint))).toBe(false);
    },
  );

  it.each(ILLEGAL_SURROGATE_HALVES)(
    'flags the unpaired surrogate with code unit %d',
    (codeUnit) => {
      const lone = String.fromCharCode(codeUnit);
      expect(hasXmlIllegalCharacters(lone)).toBe(true);
      expect(hasXmlIllegalCharacters(`text${lone}`)).toBe(true);
      expect(hasXmlIllegalCharacters(`${lone}text`)).toBe(true);
    },
  );

  it('flags a low surrogate that comes before a high one', () => {
    expect(hasXmlIllegalCharacters('\udc00\ud800')).toBe(true);
  });

  it('accepts a surrogate pair, which is one astral character', () => {
    expect(hasXmlIllegalCharacters('😀')).toBe(false);
    expect(hasXmlIllegalCharacters('\ud83d\ude00')).toBe(false);
    expect(hasXmlIllegalCharacters('𠮷野家')).toBe(false);
  });

  it('flags a lone surrogate beside a valid pair', () => {
    expect(hasXmlIllegalCharacters('😀\ud800')).toBe(true);
    expect(hasXmlIllegalCharacters('\udc00😀')).toBe(true);
  });

  it('accepts the characters at the edges of the legal ranges', () => {
    for (const codePoint of [0x20, 0xd7ff, 0xe000, 0xfffd, 0x10000, 0x10ffff]) {
      expect(hasXmlIllegalCharacters(character(codePoint))).toBe(false);
    }
  });

  // XML 1.0 excludes only U+FFFE and U+FFFF of the noncharacters.
  it('accepts the other Unicode noncharacters', () => {
    expect(hasXmlIllegalCharacters(character(0xfdd0))).toBe(false);
    expect(hasXmlIllegalCharacters(character(0x1fffe))).toBe(false);
    expect(hasXmlIllegalCharacters(character(0x10fffe))).toBe(false);
  });

  it('accepts text in other scripts, accents and punctuation', () => {
    for (const text of [
      '',
      'plain ascii',
      '日本語のテキスト',
      '中文 名字',
      'Café',
      'Cafe\u0301',
      'Привет, мир',
      'مرحبا',
      'a\tb\nc\r\nd',
      '"quoted" <tag> & more',
    ]) {
      expect(hasXmlIllegalCharacters(text)).toBe(false);
    }
  });
});

describe('stripXmlIllegalCharacters', () => {
  it('returns the very same string when nothing is illegal', () => {
    const text = '日本語 Café 😀\t\n\r';
    expect(stripXmlIllegalCharacters(text)).toBe(text);
  });

  it.each(ILLEGAL_C0)(
    'removes the C0 control with code point %d',
    (codePoint) => {
      expect(stripXmlIllegalCharacters(`a${character(codePoint)}b`)).toBe('ab');
    },
  );

  it('removes U+FFFE and U+FFFF', () => {
    expect(stripXmlIllegalCharacters('a\ufffeb\uffffc')).toBe('abc');
  });

  it.each(ILLEGAL_SURROGATE_HALVES)(
    'removes the unpaired surrogate with code unit %d',
    (codeUnit) => {
      expect(
        stripXmlIllegalCharacters(`a${String.fromCharCode(codeUnit)}b`),
      ).toBe('ab');
    },
  );

  it('keeps tab, line feed and carriage return', () => {
    expect(stripXmlIllegalCharacters('a\tb\nc\rd')).toBe('a\tb\nc\rd');
  });

  it('keeps DEL and the C1 controls', () => {
    const kept = `a${character(0x7f)}${character(0x85)}${character(0x9f)}b`;
    expect(stripXmlIllegalCharacters(kept)).toBe(kept);
  });

  it('keeps a surrogate pair whole and removes a lone half beside it', () => {
    expect(stripXmlIllegalCharacters('😀\ud800😀')).toBe('😀😀');
    expect(stripXmlIllegalCharacters('\udc00😀\ud800')).toBe('😀');
  });

  it('removes only the illegal characters and keeps the rest in order', () => {
    expect(stripXmlIllegalCharacters('名\u0000前\ufffe は \u001f田中')).toBe(
      '名前 は 田中',
    );
  });

  it('keeps accented text exactly as written, composed or not', () => {
    expect(stripXmlIllegalCharacters('Caf\u0000é')).toBe('Café');
    expect(stripXmlIllegalCharacters('Cafe\u0301\u0001')).toBe('Cafe\u0301');
  });

  it('leaves nothing for xmlIllegalCodePoints to find', () => {
    const text = `a${character(0x7)}b${character(0xffff)}`;
    expect(xmlIllegalCodePoints(stripXmlIllegalCharacters(text))).toEqual([]);
  });

  it('leaves nothing for hasXmlIllegalCharacters to find', () => {
    const everything = [
      ...range(0x0, 0x1f),
      0x7f,
      0x9f,
      0xd800,
      0xdfff,
      0xfffe,
      0xffff,
    ]
      .map((codePoint) => String.fromCharCode(codePoint))
      .join('');
    expect(hasXmlIllegalCharacters(everything)).toBe(true);
    expect(hasXmlIllegalCharacters(stripXmlIllegalCharacters(everything))).toBe(
      false,
    );
  });
});

describe('xmlIllegalCodePoints', () => {
  it('finds nothing in text XML 1.0 can hold', () => {
    expect(xmlIllegalCodePoints('日本語 Café 😀\t\n\r')).toEqual([]);
    expect(xmlIllegalCodePoints('')).toEqual([]);
  });

  it('writes each character as its code point, four hex digits or more', () => {
    expect(
      xmlIllegalCodePoints(
        `${character(0x0)}${character(0x7)}${character(0x1f)}${character(0xfffe)}`,
      ),
    ).toEqual(['U+0000', 'U+0007', 'U+001F', 'U+FFFE']);
  });

  it('names each character once, in the order it first appears', () => {
    const bell = character(0x7);
    const unit = character(0x1f);
    expect(
      xmlIllegalCodePoints(`${unit}a${bell}b${unit}c${bell}${bell}`),
    ).toEqual(['U+001F', 'U+0007']);
  });

  it('names an unpaired surrogate, and not either half of a pair', () => {
    const lone = String.fromCharCode(0xd800);
    expect(xmlIllegalCodePoints(`😀${lone}😀`)).toEqual(['U+D800']);
  });

  it('names exactly what stripXmlIllegalCharacters removes', () => {
    for (const codePoint of [...ILLEGAL_C0, 0xfffe, 0xffff]) {
      const text = `a${character(codePoint)}b`;
      expect(xmlIllegalCodePoints(text)).toHaveLength(1);
      expect(stripXmlIllegalCharacters(text)).toBe('ab');
    }
    for (const codePoint of [...KEPT_C0, 0x7f, 0x85, 0xfdd0, 0x10ffff]) {
      expect(xmlIllegalCodePoints(character(codePoint))).toEqual([]);
    }
  });
});
