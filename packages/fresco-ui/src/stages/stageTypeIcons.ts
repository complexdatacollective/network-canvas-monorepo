import { createLucideIcon } from 'lucide-react';

// Icons for the interfaces Lucide has no fitting glyph for, drawn to Lucide's
// rules (24-unit grid, 2-unit round strokes, no fills) from the same parts: a
// node is a small circle, a tie is a line between two nodes, the participant
// is Lucide's person and a form is Lucide's clipboard. Each element carries a
// `key` because Lucide renders the drawing as a list of children.

type IconElement = Parameters<typeof createLucideIcon>[1][number];

const CLIPBOARD_CLIP: IconElement = [
  'rect',
  { width: '8', height: '4', x: '8', y: '2', rx: '1', ry: '1', key: 'clip' },
];

const CLIPBOARD_BOARD: IconElement = [
  'path',
  {
    d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
    key: 'board',
  },
];

/** Lucide's clipboard whose bottom edge rises into the participant's shoulders. */
export const EgoFormIcon = createLucideIcon('ego-form', [
  CLIPBOARD_CLIP,
  [
    'path',
    {
      d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2a4 4 0 0 0-8 0H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
      key: 'board',
    },
  ],
  ['circle', { cx: '12', cy: '12', r: '2', key: 'head' }],
]);

/** A clipboard holding one node: a form about each person. */
export const AlterFormIcon = createLucideIcon('alter-form', [
  CLIPBOARD_CLIP,
  CLIPBOARD_BOARD,
  ['circle', { cx: '12', cy: '14', r: '3', key: 'node' }],
]);

/** A clipboard holding two joined nodes: a form about each tie. */
export const AlterEdgeFormIcon = createLucideIcon('alter-edge-form', [
  CLIPBOARD_CLIP,
  CLIPBOARD_BOARD,
  ['circle', { cx: '9', cy: '17', r: '2', key: 'from' }],
  ['circle', { cx: '15', cy: '11', r: '2', key: 'to' }],
  ['path', { d: 'M10.5 15.5l3-3', key: 'tie' }],
]);

/** A ring around a centre node, with one node on the ring tied to it. */
export const SociogramIcon = createLucideIcon('sociogram', [
  ['path', { d: 'M2.071 13.193A10 10 0 0 1 13.193 2.071', key: 'ring-top' }],
  [
    'path',
    { d: 'M21.929 10.807A10 10 0 0 1 10.807 21.929', key: 'ring-bottom' },
  ],
  ['circle', { cx: '12', cy: '12', r: '2.5', key: 'hub' }],
  ['circle', { cx: '19', cy: '5', r: '2.5', key: 'tied' }],
  ['circle', { cx: '5', cy: '19', r: '2.5', key: 'untied' }],
  ['path', { d: 'M13.768 10.232L17.232 6.768', key: 'tie' }],
]);

/** Three nodes joined into a network, with a plus in the open corner. */
export const NetworkComposerIcon = createLucideIcon('network-composer', [
  ['circle', { cx: '5.5', cy: '5.5', r: '2.5', key: 'a' }],
  ['circle', { cx: '17.5', cy: '8', r: '2.5', key: 'b' }],
  ['circle', { cx: '8', cy: '18', r: '2.5', key: 'c' }],
  ['path', { d: 'M8 6 15 7.5', key: 'ab' }],
  ['path', { d: 'M6 8 7.5 15.5', key: 'ac' }],
  ['path', { d: 'M15.5 10 10 16', key: 'bc' }],
  ['path', { d: 'M15.5 18.5h6', key: 'plus-h' }],
  ['path', { d: 'M18.5 15.5v6', key: 'plus-v' }],
]);

/** A tied pair inside a group outline that carries a speech tail. */
export const NarrativeIcon = createLucideIcon('narrative', [
  ['circle', { cx: '9', cy: '9', r: '2.5', key: 'from' }],
  ['circle', { cx: '15', cy: '15', r: '2.5', key: 'to' }],
  ['path', { d: 'm10.8 10.8 2.4 2.4', key: 'tie' }],
  [
    'path',
    {
      d: 'M14 4l6 6a7.07 7.07 0 0 1-10 10l-1.5-1.5-5 2 2-5L4 14A7.07 7.07 0 0 1 14 4z',
      key: 'outline',
    },
  ],
]);

const TIED_PAIR: IconElement[] = [
  ['circle', { cx: '5', cy: '19', r: '3', key: 'from' }],
  ['circle', { cx: '19', cy: '19', r: '3', key: 'to' }],
  ['path', { d: 'M8 19h8', key: 'tie' }],
];

/** Two tied nodes under a question mark: do these two know each other? */
export const DyadCensusIcon = createLucideIcon('dyad-census', [
  [
    'path',
    { d: 'M8 5a4 4 0 0 1 7.5 1c0 2.5-3.5 3.5-3.5 3.5', key: 'question' },
  ],
  ['path', { d: 'M12 13.5h.01', key: 'dot' }],
  ...TIED_PAIR,
]);

/** Dyad census's tied pair under rising bars: how strong is the tie? */
export const TieStrengthCensusIcon = createLucideIcon('tie-strength-census', [
  ['path', { d: 'M7 12V8', key: 'low' }],
  ['path', { d: 'M12 12V5', key: 'mid' }],
  ['path', { d: 'M17 12V2', key: 'high' }],
  ...TIED_PAIR,
]);
