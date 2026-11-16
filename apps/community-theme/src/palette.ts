import {
  type Scope,
  toDisplayColor,
} from '@codaco/tailwind-config/theme-colors';

import { forumScopes } from './scopes.ts';

/**
 * Discourse's colour palette slots, each filled from the Network Canvas token
 * that plays the same part. Discourse stores a palette as hex and derives its
 * whole shade scale (`--primary-low`, `--tertiary-medium`, …) from these
 * slots when it compiles a stylesheet, so they must be concrete colours rather
 * than the token CSS the rest of the theme uses.
 *
 * - `primary` is Discourse's text colour. `secondary` is the background it
 *   paints content with (topic rows, menus, dialogs, the composer), so it
 *   takes the surface colour of the theme's content sheet; the theme paints
 *   the tinted page around the sheet itself.
 * - `tertiary` colours links and accents; primary buttons are restyled to the
 *   Network Canvas primary in the theme's stylesheet.
 * - `selected` and `hover` are the backgrounds of selected and hovered rows in
 *   lists and menus.
 */
const DISCOURSE_SLOTS = {
  primary: 'var(--text)',
  secondary: 'var(--surface)',
  tertiary: 'var(--link)',
  quaternary: 'var(--accent)',
  header_background: 'var(--surface)',
  header_primary: 'var(--text)',
  highlight: 'var(--selected)',
  selected: 'var(--neutral)',
  hover: 'var(--surface-2)',
  danger: 'var(--destructive)',
  success: 'var(--success)',
  love: 'oklch(var(--paradise-pink))',
} as const;

type DiscourseSlot = keyof typeof DISCOURSE_SLOTS;
export type DiscoursePalette = Record<DiscourseSlot, string>;

/** The palette names the theme ships, shown in Discourse's palette picker. */
export const PALETTE_NAMES = {
  light: 'Network Canvas',
  dark: 'Network Canvas Dark',
} as const;

function hexOf(scope: Scope, expression: string) {
  return toDisplayColor(scope.color(expression))
    .toString({ format: 'hex', collapse: false })
    .slice(1)
    .toUpperCase();
}

function paletteFor(scope: Scope): DiscoursePalette {
  const slot = (name: DiscourseSlot) => hexOf(scope, DISCOURSE_SLOTS[name]);
  return {
    primary: slot('primary'),
    secondary: slot('secondary'),
    tertiary: slot('tertiary'),
    quaternary: slot('quaternary'),
    header_background: slot('header_background'),
    header_primary: slot('header_primary'),
    highlight: slot('highlight'),
    selected: slot('selected'),
    hover: slot('hover'),
    danger: slot('danger'),
    success: slot('success'),
    love: slot('love'),
  };
}

/** The light and dark palettes, keyed by the names Discourse shows. */
export function discoursePalettes(): Record<string, DiscoursePalette> {
  const scopes = forumScopes();
  return {
    [PALETTE_NAMES.light]: paletteFor(scopes.light),
    [PALETTE_NAMES.dark]: paletteFor(scopes.dark),
  };
}
