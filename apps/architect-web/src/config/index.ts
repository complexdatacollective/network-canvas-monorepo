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

// Target protocol schema version. Used to determine compatibility & migration
export const APP_SCHEMA_VERSION = 8 as const;

// Maps for supported asset types within the app. Used by asset chooser.
export const SUPPORTED_EXTENSION_TYPE_MAP = {
  network: ['.csv', '.json'],
  image: ['.jpg', '.jpeg', '.gif', '.png'],
  audio: ['.mp3', '.aiff', '.m4a'],
  video: ['.mov', '.mp4'],
  geojson: ['.geojson'],
};
