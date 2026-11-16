/**
 * The Fresco type scale (`text-2xs` to `text-6xl`) as plain CSS, read from the
 * `@theme` block in `fresco/theme.css`: each step's font size with the line
 * height and letter spacing Tailwind's `text-*` utilities apply alongside it.
 *
 * Exported to this repository as `@codaco/tailwind-config/type-scale`, for
 * code that styles elements without Tailwind: the community forum's Discourse
 * theme sets Discourse's type steps from it. It is not published (see
 * `publishConfig.exports`). Sizes are written against
 * `var(--theme-root-size)` and `var(--theme-vw, 1vw)`, as in the theme, so a
 * consumer declares (or renames) those.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const THEME_TOKENS_FILE = fileURLToPath(
  new URL('../fresco/theme.css', import.meta.url),
);

export type TypeStep = {
  /** The step's name in the `text-*` utilities: `2xs`, `sm`, `base`, `3xl`. */
  name: string;
  fontSize: string;
  lineHeight: string;
  letterSpacing: string;
};

const DECLARATION =
  /--text-([a-z0-9]+)(?:--(line-height|letter-spacing))?\s*:\s*([^;]+);/g;

/** Every step of the scale, smallest first, in the theme's order. */
export function typeScale(): TypeStep[] {
  const css = readFileSync(THEME_TOKENS_FILE, 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
  const steps = new Map<string, Partial<TypeStep>>();
  for (const [, name, part, raw] of css.matchAll(DECLARATION)) {
    if (!name || !raw) continue;
    const value = raw
      .replace(/\s+/g, ' ')
      .replace(/\( /g, '(')
      .replace(/ \)/g, ')')
      .trim();
    const step = steps.get(name) ?? { name };
    if (part === 'line-height') step.lineHeight = value;
    else if (part === 'letter-spacing') step.letterSpacing = value;
    else step.fontSize = value;
    steps.set(name, step);
  }
  if (steps.size === 0) {
    throw new Error(`No --text-* steps found in ${THEME_TOKENS_FILE}`);
  }
  return [...steps.values()].map((step) => {
    const { name, fontSize, lineHeight, letterSpacing } = step;
    if (!name || !fontSize || !lineHeight || !letterSpacing) {
      throw new Error(
        `text-${name ?? '?'} lacks a font size, line height or letter spacing in ${THEME_TOKENS_FILE}`,
      );
    }
    return { name, fontSize, lineHeight, letterSpacing };
  });
}
