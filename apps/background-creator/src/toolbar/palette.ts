// Document-colour swatches offered in the properties colour control. These are
// baked into exported SVGs as literal fill/stroke values, so they must be
// concrete hex strings — never `var(--…)` references, which would not resolve
// outside this app.
//
// The eight hues are the interview data-visualisation palette resolved to sRGB:
// each is `oklch(--node-N)` from tooling/tailwind/fresco/themes/default.css,
// whose base OKLCH components live in tooling/tailwind/shared/colors.css. The
// hex values below are those OKLCH colours converted to sRGB (kept literal so a
// saved background reads identically wherever it is opened). The two neutrals
// (white, near-black) bracket the ramp for legibility on any preview surface.

type Swatch = { value: string; label: string };

// Theme-linked sentinel values (see ~/model/paint). Unlike the hex swatches
// these serialize as CSS classes resolved by the exported SVG's embedded
// style, so a background tracks the host theme's text/background colours.
export const THEME_SWATCHES: Swatch[] = [
  { value: 'text', label: 'Text colour' },
  { value: 'background', label: 'Background colour' },
];

export const NEUTRAL_SWATCHES: Swatch[] = [
  { value: '#ffffff', label: 'White' },
  { value: '#17142f', label: 'Near black' },
];

// Order mirrors --node-1..8 in default.css. Source colour names are noted so the
// origin of each hex is traceable back to tooling/tailwind/shared/colors.css.
export const HUE_SWATCHES: Swatch[] = [
  { value: '#e8004f', label: 'Coral' }, // --node-1 neon-coral
  { value: '#13bde0', label: 'Sea blue' }, // --node-2 sea-serpent
  { value: '#ce1bee', label: 'Purple' }, // --node-3 purple-pizazz
  { value: '#f49324', label: 'Carrot' }, // --node-4 neon-carrot
  { value: '#78c25b', label: 'Green' }, // --node-5 kiwi
  { value: '#0f6fff', label: 'Blue' }, // --node-6 cerulean-blue
  { value: '#ff238e', label: 'Pink' }, // --node-7 paradise-pink
  { value: '#f1b700', label: 'Mustard' }, // --node-8 mustard
];

export const SWATCHES: Swatch[] = [...NEUTRAL_SWATCHES, ...HUE_SWATCHES];
