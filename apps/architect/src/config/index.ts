import {
  createAppIntl,
  defineMessages,
  type IntlShape,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
const defaultIntl = createAppIntl({ locale: 'en' });
import {
  type ColorReference,
  CURRENT_SCHEMA_VERSION,
} from '@codaco/protocol-validation';
const colorMessages = defineMessages({
  neonCoral: {
    id: 'architect.config.neonCoral',
    defaultMessage: 'Neon Coral',
    description: 'Researcher-facing Architect control or feedback.',
  },
  seaSerpent: {
    id: 'architect.config.seaSerpent',
    defaultMessage: 'Sea Serpent',
    description: 'Researcher-facing Architect control or feedback.',
  },
  purplePizazz: {
    id: 'architect.config.purplePizazz',
    defaultMessage: 'Purple Pizazz',
    description: 'Researcher-facing Architect control or feedback.',
  },
  neonCarrot: {
    id: 'architect.config.neonCarrot',
    defaultMessage: 'Neon Carrot',
    description: 'Researcher-facing Architect control or feedback.',
  },
  kiwi: {
    id: 'architect.config.kiwi',
    defaultMessage: 'Kiwi',
    description: 'Researcher-facing Architect control or feedback.',
  },
  ceruleanBlue: {
    id: 'architect.config.ceruleanBlue',
    defaultMessage: 'Cerulean Blue',
    description: 'Researcher-facing Architect control or feedback.',
  },
  paradisePink: {
    id: 'architect.config.paradisePink',
    defaultMessage: 'Paradise Pink',
    description: 'Researcher-facing Architect control or feedback.',
  },
  mustard: {
    id: 'architect.config.mustard',
    defaultMessage: 'Mustard',
    description: 'Researcher-facing Architect control or feedback.',
  },
  tomato: {
    id: 'architect.config.tomato',
    defaultMessage: 'Tomato',
    description: 'Researcher-facing Architect control or feedback.',
  },
  slateBlue: {
    id: 'architect.config.slateBlue',
    defaultMessage: 'Slate Blue',
    description: 'Researcher-facing Architect control or feedback.',
  },
  seaGreen: {
    id: 'architect.config.seaGreen',
    defaultMessage: 'Sea Green',
    description: 'Researcher-facing Architect control or feedback.',
  },
  barbiePink: {
    id: 'architect.config.barbiePink',
    defaultMessage: 'Barbie Pink',
    description: 'Researcher-facing Architect control or feedback.',
  },
  color: {
    id: 'architect.config.color',
    defaultMessage: 'Color {index, number}',
    description: 'Researcher-facing Architect control or feedback.',
  },
  protocolNameTooLong: {
    id: 'architect.config.protocolNameTooLong',
    defaultMessage: 'Protocol names are limited to {max, number} characters.',
    description: 'Researcher-facing Architect control or feedback.',
  },
});

// Color palette sizes, they follow the pattern: ord-color-seq-1...ord-color-seq-n
// Node/edge sizes must not exceed the schema's Node/EdgeColorSequence (8 each):
// the picker offers `<palette>-1..N`, and anything past the sequence would fail
// protocol validation.
export const COLOR_PALETTES = {
  'ord-color-seq': 8,
  'node-color-seq': 8,
  'edge-color-seq': 8,
  'cat-color-seq': 10,
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
 * Every position the theme defines is named, even when an individual picker
 * deliberately offers only a subset of that sequence.
 */
export const COLOR_PALETTE_SWATCH_NAMES: Record<
  string,
  readonly MessageDescriptor[]
> = {
  'node-color-seq': [
    colorMessages.neonCoral,
    colorMessages.seaSerpent,
    colorMessages.purplePizazz,
    colorMessages.neonCarrot,
    colorMessages.kiwi,
    colorMessages.ceruleanBlue,
    colorMessages.paradisePink,
    colorMessages.mustard,
  ],
  'edge-color-seq': [
    colorMessages.mustard,
    colorMessages.purplePizazz,
    colorMessages.neonCoral,
    colorMessages.kiwi,
    colorMessages.paradisePink,
    colorMessages.tomato,
    colorMessages.seaSerpent,
    colorMessages.slateBlue,
    colorMessages.seaGreen,
    colorMessages.ceruleanBlue,
  ],
  'ord-color-seq': [
    colorMessages.seaGreen,
    colorMessages.seaSerpent,
    colorMessages.tomato,
    colorMessages.neonCarrot,
    colorMessages.kiwi,
    colorMessages.ceruleanBlue,
    colorMessages.paradisePink,
    colorMessages.mustard,
    colorMessages.purplePizazz,
    colorMessages.slateBlue,
  ],
  'cat-color-seq': [
    colorMessages.seaSerpent,
    colorMessages.purplePizazz,
    colorMessages.mustard,
    colorMessages.paradisePink,
    colorMessages.kiwi,
    colorMessages.ceruleanBlue,
    colorMessages.neonCarrot,
    colorMessages.barbiePink,
    colorMessages.tomato,
    colorMessages.slateBlue,
  ],
};

const SWATCH_PATTERN = /^(.*)-(\d+)$/;

/**
 * The human name for a protocol colour token.
 *
 * Falls back to the swatch's position if this naming catalogue is incomplete.
 */
export const getColorSwatchName = (
  color: ColorReference,
  intl: IntlShape = defaultIntl,
): string => {
  const match = SWATCH_PATTERN.exec(color);
  if (!match) return color;

  const [, palette, position] = match;
  const index = Number(position);
  const name = COLOR_PALETTE_SWATCH_NAMES[palette ?? '']?.[index - 1];
  return name
    ? intl.formatMessage(name)
    : intl.formatMessage(colorMessages.color, { index });
};

/**
 * The protocol schema version this build of Architect authors and edits.
 *
 * DERIVED, never written as a literal. Architect implements the
 * `@codaco/protocol-validation` contract directly (unlike Interviewer and
 * Fresco, whose compatibility comes from the `@codaco/interview` runtime they
 * embed), so the package that owns the schema is the only thing that may say
 * which version is current. A literal here could silently disagree with the
 * schemas Architect actually validates against, and every compatibility
 * decision — open, migrate, refuse — is made against this number.
 *
 * Typed as the package's own literal (currently `8`) rather than widened to
 * `number`, so it stays assignable to `SchemaVersion` and every protocol-type
 * derivation keeps flowing through it.
 */
export const APP_SCHEMA_VERSION: typeof CURRENT_SCHEMA_VERSION =
  CURRENT_SCHEMA_VERSION;

// Product limit on a protocol name, counted in graphemes (see
// `~/utils/countGraphemes`) rather than UTF-16 code units. Stage labels are
// capped at 50 (`StageHeading`); a protocol name legitimately carries more
// context (study + wave + version), and 100 fits
// "Study Name — Wave 2 — v3.1 (2026)" comfortably while keeping the name from
// consuming the editor viewport.
//
// Deliberately an Architect product rule and NOT a schema rule: `ProtocolSchema`
// still accepts any non-empty name, so a `.netcanvas` authored by an older
// Architect (or by Interviewer/Fresco) with a longer name keeps opening and is
// never rewritten on load. An over-limit name renders bounded and stays
// editable — only edits that push its count FURTHER over the limit are refused.
export const PROTOCOL_NAME_MAX_LENGTH = 100;

// One message for both places a researcher can name a protocol — the create
// dialog and the editor's own name control — so the two surfaces cannot drift
// into quoting different limits, and there is one whole string to localise.
export const PROTOCOL_NAME_TOO_LONG_MESSAGE = colorMessages.protocolNameTooLong;

// Maps for supported asset types within the app. Used by asset chooser.
export const SUPPORTED_EXTENSION_TYPE_MAP = {
  network: ['.csv', '.json'],
  image: ['.jpg', '.jpeg', '.gif', '.png', '.svg'],
  audio: ['.mp3', '.aiff', '.m4a'],
  video: ['.mov', '.mp4'],
  geojson: ['.geojson'],
};
