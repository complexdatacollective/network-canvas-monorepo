import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

// The Unicode blocks that hold Arabic-script characters and nothing a Latin
// page uses.
const ARABIC_BLOCKS: [number, number][] = [
  [0x0600, 0x06ff], // Arabic
  [0x0750, 0x077f], // Arabic Supplement
  [0x0870, 0x08ff], // Arabic Extended-B and Extended-A
  [0xfb50, 0xfdff], // Arabic Presentation Forms-A
  [0xfe70, 0xfeff], // Arabic Presentation Forms-B
  [0x102e0, 0x102ff], // Coptic Epact Numbers
  [0x10e60, 0x10e7f], // Rumi Numeral Symbols
  [0x10ec0, 0x10eff], // Arabic Extended-C
  [0x1ee00, 0x1eeff], // Arabic Mathematical Alphabetic Symbols
];

function unicodeRanges(css: string) {
  return [...css.matchAll(/unicode-range:\s*([^;]+);/g)].flatMap(([, list]) =>
    (list ?? '').split(',').map((part): [number, number] => {
      const [start = '', end = start] = part
        .trim()
        .replace(/^U\+/i, '')
        .split('-');
      return [Number.parseInt(start, 16), Number.parseInt(end, 16)];
    }),
  );
}

describe('the Arabic-script face', () => {
  const css = read('../shared/fonts/readex-pro.css');

  it('declares only the Arabic subset of Readex Pro', () => {
    expect(
      [...css.matchAll(/url\('([^']+)'\)/g)].map(([, url]) => url),
    ).toEqual([
      '@fontsource-variable/readex-pro/files/readex-pro-arabic-wght-normal.woff2',
    ]);
  });

  // A code point outside these blocks (fontsource's own range has U+2010 and
  // the zero-width joiners) would send Latin text to this face: no Latin face
  // in the stacks has a glyph for them.
  it('claims no code point a Latin page uses', () => {
    const ranges = unicodeRanges(css);
    expect(ranges.length).toBeGreaterThan(0);
    const outside = ranges.filter(
      ([start, end]) =>
        !ARABIC_BLOCKS.some(
          ([blockStart, blockEnd]) => start >= blockStart && end <= blockEnd,
        ),
    );
    expect(outside).toEqual([]);
  });
});

describe.each(['default', 'interview', 'studio'])(
  'the %s theme font stacks',
  (theme) => {
    const css = read(`../fresco/themes/${theme}.css`);

    it.each(['--heading-font', '--body-font'])(
      'set %s in a Latin face first, then Readex Pro',
      (property) => {
        const value = new RegExp(`${property}:\\s*([^;]+);`).exec(css)?.[1];
        const families = (value ?? '')
          .split(',')
          .map((family) => family.trim());
        expect(families).toHaveLength(3);
        expect(families[0]).toMatch(/^'(Nunito|Inclusive Sans) Variable'$/);
        expect(families.slice(1)).toEqual([
          "'Readex Pro Variable'",
          'sans-serif',
        ]);
      },
    );
  },
);
