import plugin from 'tailwindcss/plugin';

/**
 * Tailwind plugin that adds an `inset-surface` utility for creating
 * background-color-adaptive inset (pressed-in) shadows.
 *
 * This is the conceptual opposite of the elevation plugin: elevation raises
 * elements above the surface, while inset-surface presses them into it.
 *
 * Shadow colors derive from the element's own background color (captured via
 * `--inset-bg`), tinting the shadows with the background's hue/chroma.
 * Fixed lightness values ensure the effect works universally, while
 * shadow opacity scales with background chroma — vivid backgrounds
 * produce more pronounced shadows, neutrals stay subtle:
 *
 * - `bg-primary/10` (light tint) -> subtle purple-tinted shadows
 * - `bg-info` (full saturated)   -> stronger, color-tinted shadows
 * - `bg-surface` (neutral)       -> faint achromatic shadows
 *
 * Uses a separate `--inset-bg` variable (not `--scoped-bg`) because the
 * elevation plugin resets `--scoped-bg` to `inherit` on non-publishing
 * elements. Inset shadows need the element's own color.
 *
 * Usage:
 *   <div class="bg-primary/10 inset-surface">
 *
 * Theme override:
 * The full inset shadow expression is wrapped in `var(--inset-surface-shadow, …)`
 * with the adaptive formula as the fallback, so themes can replace the
 * entire shadow when the chroma-driven formula isn't enough — e.g. the
 * interview theme's low-chroma dark surfaces bottom out at the formula's
 * 0.1 alpha floor and need a stronger fixed shadow to read as recessed.
 */

// Rewrite `var(--color-X)` references to `var(--X)` so --scoped-bg /
// --scoped-text point at the bare semantic tokens declared by the
// theme files (`--background`, `--text`, etc.) rather than going
// through Tailwind's `--color-*` indirection. Tailwind's
// `api.theme(...)` resolves color tokens to their `--color-*` form
// regardless of `@theme inline`, so we strip the prefix at plugin
// emit time. Literal values (oklch(...), currentColor) are
// unchanged because they don't match the pattern.
const stripColorPrefix = (value: string) =>
  value.replace(/var\(--color-/g, 'var(--');

const insetSurfacePlugin: ReturnType<typeof plugin> = plugin((api) => {
  api.matchUtilities(
    {
      bg: (value) => ({
        '--inset-bg': stripColorPrefix(value),
      }),
    },
    {
      values: api.theme?.('backgroundColor') ?? api.theme?.('colors') ?? {},
      modifiers: 'any',
    },
  );

  // Shadow: opacity scales *inversely* with lightness because the near-black
  //        shadow (l 0.1) has low contrast on dark surfaces and high contrast
  //        on light ones. So dark backgrounds (the interview navy palette) need
  //        high opacity (~0.6) to read as recessed, while white needs little
  //        (~0.12) or it looks heavy. The shadow color stays hue-tinted by the
  //        background via the chroma term; only the opacity is lightness-driven.
  // Highlight: opacity is driven by lightness plus a plain `c` chroma boost
  //        (not gated by lightness via `c * l`), so saturation lifts the highlight
  //        even on dark surfaces — a dark vivid color gets a prominent
  //        highlight, while a dark *muted* color (navy-taupe) stays near the
  //        0.2 floor. The offset keeps low-chroma darks down; light saturated
  //        colors (primary) reach the cap and light neutrals keep a visible
  //        highlight via the lightness term.
  const shadow = `oklch(from var(--inset-bg) 0.1 clamp(0, calc(c * 0.8), 0.08) h / clamp(0.12, calc(0.79 - l * 0.67), 0.6))`;
  const highlight = `oklch(from var(--inset-bg) 1 clamp(0, calc(c * 0.15), 0.04) h / clamp(0.2, calc(l * 0.95 + c * 2.8 - 0.32), 1))`;

  const adaptiveShadow = `inset 0 2px 4px 0 ${shadow}, inset 0 -1px 2px 0 ${highlight}`;

  api.addUtilities({
    '.inset-surface': {
      'border': '1px solid oklch(0% 0 0 / 0.1)',
      'box-shadow': adaptiveShadow,
    },
  });
});

export default insetSurfacePlugin;
