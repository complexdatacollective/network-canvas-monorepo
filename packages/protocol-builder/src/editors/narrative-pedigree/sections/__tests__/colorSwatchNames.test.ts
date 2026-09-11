import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';

import { ordinalColorOptions } from '../../../ordinal-bin/sections/ordinalColors.ts';
import { diseaseColorOptions } from '../diseaseColors.ts';

/**
 * The swatch names a researcher hears are only correct while the theme still
 * resolves each position to that hue.
 *
 * Ported from Architect's own `config/__tests__/colorSwatchNames.test.ts`,
 * which pinned the same two tables: a reordered palette fails here rather than
 * silently teaching a screen-reader user that swatch 3 is "Purple Pizazz" when
 * it is now green.
 *
 * The stylesheet is read off disk rather than imported: the package's vitest
 * config does not process CSS, so a `?raw` import would arrive empty. The path
 * is resolved from the runner's working directory — the package root, the same
 * assumption `__tests__/packageSource.ts` makes — and asserted below rather
 * than trusted.
 */
const THEME_PATH = join(
  process.cwd(),
  '../../tooling/tailwind/fresco/themes/default.css',
);

/** `--node-3: oklch(var(--purple-pizazz));` -> `{ 'node-3': 'purple-pizazz' }` */
const readThemeHues = (): Map<string, string> => {
  const css = readFileSync(THEME_PATH, 'utf8');
  const hues = new Map<string, string>();
  const declaration =
    /--((?:node|edge|ord|cat)-\d+)\s*:\s*oklch\(var\(--([a-z-]+)\)\)/g;
  let match = declaration.exec(css);
  while (match) {
    const [, token, hue] = match;
    if (token !== undefined && hue !== undefined) hues.set(token, hue);
    match = declaration.exec(css);
  }
  return hues;
};

/** `purple-pizazz` -> `Purple Pizazz`, the form the names are written in. */
const titleCase = (hue: string) =>
  hue
    .split('-')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');

const intl = createAppIntl({ locale: 'en' });

describe('protocol colour swatch names', () => {
  const themeHues = readThemeHues();

  it('reads the theme it is pinned against', () => {
    // Guards the regex and the path: an empty map would make every assertion
    // below vacuous.
    expect(themeHues.size).toBeGreaterThan(0);
  });

  it.each([
    ['node', diseaseColorOptions(intl)],
    ['ord', ordinalColorOptions(intl)],
  ])(
    'names every %s swatch after the hue the theme gives it',
    (prefix, options) => {
      expect(options.length).toBeGreaterThan(0);

      const expected = options.map((_, index) => {
        const hue = themeHues.get(`${prefix}-${index + 1}`);
        expect(hue, `theme defines no --${prefix}-${index + 1}`).toBeDefined();
        return titleCase(hue ?? '');
      });

      expect(options.map((option) => option.label)).toEqual(expected);
    },
  );
});
