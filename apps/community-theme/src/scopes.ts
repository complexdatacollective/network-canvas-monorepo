import { buildScopes, Scope } from '@codaco/tailwind-config/theme-colors';

/**
 * The design system's dark link is the accent lightened by 0.1, which is
 * 4.1:1 on the dark surface and 3.5:1 on `--surface-2`, under WCAG's 4.5:1
 * for text. The forum sets links on both, so it lightens the accent by 0.2:
 * 5:1 or more on every surface, and the same violet.
 */
const DARK_LINK = 'oklch(from var(--accent) calc(l + 0.2) c h)';

/**
 * The design system's default theme sets white on its success green in both
 * modes (2.3:1 and 2.1:1) and on its dark-mode red (3.85:1), pairs its own
 * contrast test records as known failures (tooling/tailwind). The forum puts
 * labels on both, as Discourse's success and danger buttons, so it takes the
 * corrections the Studio theme made (themes/studio.css): a darker green under
 * white in light mode, and in dark mode the page's own dark colour as the
 * label on the brighter fills.
 */
const LIGHT_SUCCESS = 'oklch(from oklch(var(--sea-green)) calc(l - 0.24) c h)';
const DARK_INK = 'var(--background)';

/**
 * The colour scopes the forum is built from: the default Network Canvas
 * theme's light and dark roots, with the corrections above. Discourse's
 * palette (palette.ts) and the `--nc-*` tokens (tokens.ts) both read these,
 * so the colours Discourse derives its shades from and the theme's own agree.
 */
export function forumScopes() {
  const scopes = buildScopes();
  return {
    light: new Scope(
      'forum-light',
      [new Map([['--success', LIGHT_SUCCESS]])],
      scopes['default-light'],
    ),
    dark: new Scope(
      'forum-dark',
      [
        new Map([
          ['--link', DARK_LINK],
          // The theme declares these as var(--link); restated so they follow
          // the forum's link rather than inheriting the computed default.
          ['--surface-link', 'var(--link)'],
          ['--surface-accent-link', 'var(--link)'],
          ['--destructive-contrast', DARK_INK],
          ['--success-contrast', DARK_INK],
        ]),
      ],
      scopes['default-dark'],
    ),
  };
}
