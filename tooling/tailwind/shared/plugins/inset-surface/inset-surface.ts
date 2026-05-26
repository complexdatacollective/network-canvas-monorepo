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

const DEFAULT_BG = 'oklch(50% 0 0)';

const toColorVar = (value: string) =>
  typeof value === 'string' && value.startsWith('var(--')
    ? value.replace(/^var\(--/, 'var(--color-')
    : value;

const insetSurfacePlugin: ReturnType<typeof plugin> = plugin((api) => {
  api.matchUtilities(
    {
      bg: (value) => ({
        '--inset-bg': toColorVar(value),
      }),
    },
    {
      values: (api.theme?.('backgroundColor') ??
        api.theme?.('colors') ??
        {}) as Record<string, string>,
    },
  );

  // Shadow: opacity scales up with chroma (neutrals subtle, vivid pronounced)
  // Highlight: opacity scales up with lightness and down with chroma (bright on
  //        light neutrals where the dark shadow alone isn't enough contrast)
  const shadow = `oklch(from var(--inset-bg, ${DEFAULT_BG}) 0.15 clamp(0, calc(c * 0.3), 0.08) h / clamp(0.1, calc(0.1 + c * 0.4), 0.22))`;
  const highlight = `oklch(from var(--inset-bg, ${DEFAULT_BG}) 0.98 clamp(0, calc(c * 0.15), 0.04) h / clamp(0.35, calc(0.25 + l * 0.35 - c * 0.5), 0.65))`;

  const adaptiveShadow = `inset 0 2px 4px 0 ${shadow}, inset 0 -1px 2px 0 ${highlight}`;

  api.addUtilities({
    '.inset-surface': {
      'border': '1px solid oklch(0% 0 0 / 0.1)',
      'box-shadow': `var(--inset-surface-shadow, ${adaptiveShadow})`,
    },
  });
});

export default insetSurfacePlugin;
