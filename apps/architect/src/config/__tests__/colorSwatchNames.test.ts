import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { COLOR_PALETTE_SWATCH_NAMES } from '../index';

/**
 * The swatch names a researcher hears are only correct while the theme still
 * resolves each position to that hue. This reads the stylesheet that decides
 * it, so a reordered palette fails here rather than silently teaching a
 * screen-reader user that swatch 3 is "Purple Pizazz" when it is now green.
 *
 * Read off disk rather than imported: the app's vitest config sets
 * `css: false`, so an `?raw` import of a stylesheet arrives empty. Resolved
 * against this file, so it cannot drift with a working directory.
 */
const THEME_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../tooling/tailwind/fresco/themes/default.css',
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
    if (token && hue) hues.set(token, hue);
    match = declaration.exec(css);
  }
  return hues;
};

/** `purple-pizazz` -> `Purple Pizazz`, the form the names are written in. */
const titleCase = (hue: string) =>
  hue
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const THEME_PREFIX: Record<string, string> = {
  'node-color-seq': 'node',
  'edge-color-seq': 'edge',
  'ord-color-seq': 'ord',
  'cat-color-seq': 'cat',
};

describe('protocol colour swatch names', () => {
  const themeHues = readThemeHues();

  it('reads the theme it is pinned against', () => {
    // Guards the regex and the path: an empty map would make every assertion
    // below vacuous.
    expect(themeHues.size).toBeGreaterThan(0);
  });

  it.each(Object.keys(COLOR_PALETTE_SWATCH_NAMES))(
    'names every %s swatch after the hue the theme gives it',
    (palette) => {
      const prefix = THEME_PREFIX[palette];
      expect(prefix).toBeDefined();

      const names = COLOR_PALETTE_SWATCH_NAMES[palette] ?? [];
      const expected = names.map((_, index) => {
        const hue = themeHues.get(`${prefix ?? ''}-${index + 1}`);
        expect(hue).toBeDefined();
        return titleCase(hue ?? '');
      });

      expect([...names]).toEqual(expected);
    },
  );

  it.each(Object.keys(COLOR_PALETTE_SWATCH_NAMES))(
    'names every position the theme defines for %s',
    (palette) => {
      const prefix = THEME_PREFIX[palette] ?? '';
      const definedPositions = [...themeHues.keys()].filter((token) =>
        token.startsWith(`${prefix}-`),
      ).length;

      expect(COLOR_PALETTE_SWATCH_NAMES[palette]).toHaveLength(
        definedPositions,
      );
    },
  );
});
