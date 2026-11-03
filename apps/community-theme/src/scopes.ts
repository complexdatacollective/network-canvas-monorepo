import { buildScopes, Scope } from '@codaco/tailwind-config/theme-colors';

/**
 * The design system's dark link is the accent lightened by 0.1, which is
 * 4.1:1 on the dark surface and 3.5:1 on `--surface-2`, under WCAG's 4.5:1
 * for text. The forum sets links on both, so it lightens the accent by 0.2:
 * 5:1 or more on every surface, and the same violet.
 */
const DARK_LINK = 'oklch(from var(--accent) calc(l + 0.2) c h)';

/**
 * The colour scopes the forum is built from: the default Network Canvas
 * theme's light and dark roots, with the dark link above. Discourse's palette
 * (palette.ts) and the `--nc-*` tokens (tokens.ts) both read these, so the
 * link colour Discourse derives its shades from and the theme's own agree.
 */
export function forumScopes() {
  const scopes = buildScopes();
  return {
    light: scopes['default-light'],
    dark: new Scope(
      'forum-dark',
      [
        new Map([
          ['--link', DARK_LINK],
          // The theme declares these as var(--link); restated so they follow
          // the forum's link rather than inheriting the computed default.
          ['--surface-link', 'var(--link)'],
          ['--surface-accent-link', 'var(--link)'],
        ]),
      ],
      scopes['default-dark'],
    ),
  };
}
