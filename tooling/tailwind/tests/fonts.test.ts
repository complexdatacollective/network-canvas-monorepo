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

const declaration = (css: string, property: string) =>
  new RegExp(`${property}:\\s*([^;]+);`).exec(css)?.[1]?.replace(/\s+/g, ' ');

// Readex Pro has the letters of Arabic and not those Persian, Urdu and others
// add to the script, so it is offered only to text marked as Arabic.
describe.each(['default', 'interview', 'studio'])(
  'the %s theme font stacks',
  (theme) => {
    const css = read(`../fresco/themes/${theme}.css`);

    it.each(['heading', 'body'])(
      'name the %s face and keep Readex Pro out of its stack',
      (role) => {
        expect(declaration(css, `--${role}-face`)).toMatch(
          /^'(Nunito|Inclusive Sans) Variable'$/,
        );
        expect(declaration(css, `--${role}-font`)).toBe(
          `var(--${role}-face), sans-serif`,
        );
      },
    );
  },
);

describe('the rules for text marked as Arabic', () => {
  const css = read('../fresco/arabic-text.css').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)].map(
    ([, selector = '', body = '']) => ({
      selector: selector
        .replace(/@layer base \{/, '')
        .replace(/\s+/g, ' ')
        .trim(),
      body: body.replace(/\s+/g, ' ').trim(),
    }),
  );
  // The monospace stack every theme shares, as theme.css declares it.
  const monospace = /--font-monospace:\s*var\(\s*--monospace-font,([^)]+)\)/
    .exec(read('../fresco/theme.css'))?.[1]
    ?.replace(/\s+/g, ' ')
    .trim();
  const withReadex = `--heading-font: var(--heading-face), 'Readex Pro Variable', sans-serif; --body-font: var(--body-face), 'Readex Pro Variable', sans-serif; --monospace-font: 'Readex Pro Variable', ${monospace};`;
  const plain =
    '--heading-font: var(--heading-face), sans-serif; --body-font: var(--body-face), sans-serif; --monospace-font: initial;';

  it('add Readex Pro to every stack inside Arabic text and nowhere else', () => {
    expect(rules.find((rule) => rule.body === withReadex)?.selector).toBe(
      ':lang(ar)',
    );
    expect(css.match(/Readex Pro Variable/g)).toHaveLength(3);
  });

  // A utility inlines the theme value, so Arabic text can change the stack
  // only through a variable the value reads. Safari draws Arabic from the
  // system monospace face's own fallbacks, so Readex Pro has to come first.
  it('put Readex Pro before the monospace stack the theme falls back to', () => {
    expect(monospace).toBe(
      "ui-monospace, Menlo, Monaco, 'Fira Code', monospace",
    );
  });

  it('put the plain stacks back for another language inside Arabic text', () => {
    expect(rules.find((rule) => rule.body === plain)?.selector).toBe(
      ':lang(ar) :not(:lang(ar))',
    );
  });

  // Readex Pro lacks the letters Persian, Urdu and others add to the script.
  it('offer Readex Pro to no language but Arabic', () => {
    const fontRules = rules.filter((rule) => /font/.test(rule.body));
    expect(fontRules.length).toBeGreaterThan(0);
    expect(
      new Set(
        fontRules.flatMap((rule) =>
          [...rule.selector.matchAll(/:lang\(([^)]+)\)/g)].map(
            ([, tag]) => tag,
          ),
        ),
      ),
    ).toEqual(new Set(['ar']));
  });

  // Safari spaces every pair of letters, which pulls joined script apart.
  it('take letter-spacing off text in the languages written in the Arabic script', () => {
    const rule = rules.find(
      (candidate) => candidate.body === 'letter-spacing: 0 !important;',
    );
    expect(
      [...(rule?.selector ?? '').matchAll(/:lang\(([^)]+)\)/g)].map(
        ([, tag]) => tag,
      ),
    ).toEqual(['ar', 'fa', 'ur', 'ps', 'ckb', 'sd', 'ug']);
  });

  it.each(['fresco', 'studio'])(
    'ship in the %s barrel, after the themes',
    (barrel) => {
      const imports = [
        ...read(`../fresco/${barrel}.css`).matchAll(/@import '([^']+)'/g),
      ].map(([, path]) => path);
      expect(imports.at(-1)).toBe('./arabic-text.css');
      expect(imports).toContain('./themes/studio.css');
    },
  );
});

describe('text that takes its direction from its own content', () => {
  const css = read('../fresco/utilities.css');
  const rule = /@utility text-match-parent \{([^}]*)\}/.exec(css)?.[1] ?? '';

  // Chrome knows only the prefixed keyword and Firefox only the standard one,
  // so the utility needs both, with the standard one last for a browser that
  // knows both.
  it('stays on its container’s side in every browser', () => {
    expect(
      [...rule.matchAll(/text-align:\s*([^;]+);/g)].map(([, value]) => value),
    ).toEqual(['-webkit-match-parent', 'match-parent']);
  });
});
