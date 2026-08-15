// Color palette sizes, they follow the pattern: ord-color-seq-1...ord-color-seq-n
// Node/edge sizes must not exceed the schema's Node/EdgeColorSequence (8 each):
// the picker offers `<palette>-1..N`, and anything past the sequence would fail
// protocol validation.
export const COLOR_PALETTES = {
  'ord-color-seq': 8,
  'node-color-seq': 8,
  'edge-color-seq': 8,
};

export const COLOR_PALETTE_BY_ENTITY = {
  ordinal: 'ord-color-seq',
  node: 'node-color-seq',
  edge: 'edge-color-seq',
};

/**
 * What each swatch is CALLED, so a colour choice announces "Sea Green" rather
 * than the internal token `node-color-seq-2`.
 *
 * Not invented: every entry is the design system's own name for the hue that
 * position resolves to. `--node-1` is defined as `oklch(var(--neon-coral))` in
 * `tooling/tailwind/fresco/themes/default.css`, so the first node swatch IS
 * Neon Coral. `__tests__/colorSwatchNames.test.ts` reads that stylesheet and
 * fails if a palette is reordered underneath these names — a swatch announcing
 * the wrong colour is worse than one announcing a position.
 *
 * Every position the THEME defines is named, which is more than the picker
 * currently offers (see `COLOR_PALETTES`): a protocol authored against an
 * over-ranged picker can hold `ord-color-seq-10`, and that value still has to
 * be nameable when the picker shows it back.
 */
export const COLOR_PALETTE_SWATCH_NAMES: Record<string, readonly string[]> = {
  'node-color-seq': [
    'Neon Coral',
    'Sea Serpent',
    'Purple Pizazz',
    'Neon Carrot',
    'Kiwi',
    'Cerulean Blue',
    'Paradise Pink',
    'Mustard',
  ],
  'edge-color-seq': [
    'Mustard',
    'Purple Pizazz',
    'Neon Coral',
    'Kiwi',
    'Paradise Pink',
    'Tomato',
    'Sea Serpent',
    'Slate Blue',
    'Sea Green',
    'Cerulean Blue',
  ],
  'ord-color-seq': [
    'Sea Green',
    'Sea Serpent',
    'Tomato',
    'Neon Carrot',
    'Kiwi',
    'Cerulean Blue',
    'Paradise Pink',
    'Mustard',
    'Purple Pizazz',
    'Slate Blue',
  ],
};

const SWATCH_PATTERN = /^(.*)-(\d+)$/;

/**
 * The human name for a protocol colour token.
 *
 * Falls back to the swatch's position for a token the theme does not define —
 * a colour that cannot be rendered still has to be identifiable, or the
 * researcher holding it has no way to say which one they are replacing.
 */
export const getColorSwatchName = (color: string): string => {
  const match = SWATCH_PATTERN.exec(color);
  if (!match) return color;

  const [, palette, position] = match;
  const index = Number(position);
  const name = COLOR_PALETTE_SWATCH_NAMES[palette ?? '']?.[index - 1];
  return name ?? `Color ${index}`;
};

// Target protocol schema version. Used to determine compatibility & migration
export const APP_SCHEMA_VERSION = 8 as const;

// Maps for supported asset types within the app. Used by asset chooser.
export const SUPPORTED_EXTENSION_TYPE_MAP = {
  network: ['.csv', '.json'],
  image: ['.jpg', '.jpeg', '.gif', '.png', '.svg'],
  audio: ['.mp3', '.aiff', '.m4a'],
  video: ['.mov', '.mp4'],
  geojson: ['.geojson'],
};
