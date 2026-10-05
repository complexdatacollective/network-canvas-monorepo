import { defineMessages } from '@codaco/app-i18n/messages';
import { CURRENT_SCHEMA_VERSION } from '@codaco/protocol-validation';

const messages = defineMessages({
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
export const PROTOCOL_NAME_TOO_LONG_MESSAGE = messages.protocolNameTooLong;

// Maps for supported asset types within the app. Used by asset chooser.
export const SUPPORTED_EXTENSION_TYPE_MAP = {
  network: ['.csv', '.json'],
  image: ['.jpg', '.jpeg', '.gif', '.png', '.svg'],
  audio: ['.mp3', '.aiff', '.m4a'],
  video: ['.mov', '.mp4'],
  geojson: ['.geojson'],
};
