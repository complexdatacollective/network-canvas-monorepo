// Geometry for the design principles scene: one network of nine nodes, seen by a
// camera that moves over it as the reader scrolls.
//
// The scene is in world units, centred on where the interview device stands.
// Each form (config) gives every node a pose — position, shape, size and
// type — and the camera a position and zoom. Between forms a node's shape
// morphs through a polar sampling: every shape is a radius at a fixed set of
// angles, so a circle can become a square or a diamond by interpolating
// radii.
//
// Everything here is built to be cheap per frame. A node's outline is drawn
// at a fixed size around the origin and only changes while its shape is
// changing, in cached steps; its position and size are a transform. Edges
// that are not drawn return one constant path, so the DOM is left alone.

const SAMPLES = 72;
const TAU = Math.PI * 2;
const ANGLES = Array.from(
  { length: SAMPLES },
  (_, k) => (k / SAMPLES) * TAU - Math.PI / 2,
);

type Shape = 'circle' | 'square' | 'diamond';

/** 0 is the plain, untyped colour; 1–8 are the Fresco node colours. */
export type NodeColor = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

type Pose = {
  x: number;
  y: number;
  shape: Shape;
  // Half-width.
  w: number;
  color: NodeColor;
  // Drawn as a dashed outline: a type defined but not yet collected.
  outline?: boolean;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

function roundedBox(px: number, py: number, half: number, rr: number) {
  const qx = Math.abs(px) - half + rr;
  const qy = Math.abs(py) - half + rr;
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    rr
  );
}

// The same three shapes Fresco's Node draws: a circle, a square with a
// quarter-size radius, and that square turned and scaled to 0.85.
function distance(shape: Shape, w: number, px: number, py: number) {
  switch (shape) {
    case 'circle':
      return Math.hypot(px, py) - w;
    case 'square':
      return roundedBox(px, py, w * 0.9, w * 0.45);
    case 'diamond': {
      const half = w * 0.9 * 0.85;
      return roundedBox(
        (px + py) / Math.SQRT2,
        (py - px) / Math.SQRT2,
        half,
        half * 0.5,
      );
    }
    default:
      return 0;
  }
}

function sampleRadii(shape: Shape, w: number): Float64Array {
  const radii = new Float64Array(SAMPLES);
  ANGLES.forEach((angle, k) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let lo = 0;
    let hi = w * 2;
    for (let step = 0; step < 22; step += 1) {
      const mid = (lo + hi) / 2;
      if (distance(shape, w, mid * cos, mid * sin) < 0) lo = mid;
      else hi = mid;
    }
    radii[k] = (lo + hi) / 2;
  });
  return radii;
}

function outlineFrom(x: number, y: number, radii: ArrayLike<number>) {
  let d = '';
  for (let s = 0; s < SAMPLES; s += 1) {
    const r = radii[s] ?? 0;
    const angle = ANGLES[s]!;
    d += `${s === 0 ? 'M' : 'L'}${(x + r * Math.cos(angle)).toFixed(2)} ${(y + r * Math.sin(angle)).toFixed(2)}`;
  }
  return `${d}Z`;
}

/** Node outlines are drawn at this half-width and scaled to size. */
const UNIT = 20;
const unitRadii: Record<Shape, Float64Array> = {
  circle: sampleRadii('circle', UNIT),
  square: sampleRadii('square', UNIT),
  diamond: sampleRadii('diamond', UNIT),
};

// Shape morphs in 32 cached steps: a step is far below what the eye can see
// in a shape, and no outline is ever resampled twice.
const SHAPE_STEPS = 32;
const shapeCache = new Map<string, string>();
function unitOutline(a: Shape, b: Shape, k: number) {
  if (a === b) return restingOutline(a);
  const q = Math.round(k * SHAPE_STEPS);
  if (q === 0) return restingOutline(a);
  if (q === SHAPE_STEPS) return restingOutline(b);
  const key = `${a}-${b}-${q}`;
  let d = shapeCache.get(key);
  if (!d) {
    const ra = unitRadii[a];
    const rb = unitRadii[b];
    const t = q / SHAPE_STEPS;
    d = outlineFrom(
      0,
      0,
      Array.from({ length: SAMPLES }, (_, s) => lerp(ra[s]!, rb[s]!, t)),
    );
    shapeCache.set(key, d);
  }
  return d;
}
for (const shape of ['circle', 'square', 'diamond'] as const) {
  shapeCache.set(`${shape}-${shape}-0`, outlineFrom(0, 0, unitRadii[shape]));
}
// Same-shape lookups hit this key directly.
function restingOutline(shape: Shape) {
  return shapeCache.get(`${shape}-${shape}-0`)!;
}

// --- The scene ---------------------------------------------------------------

/** The interview device, centred on the world origin. */
const DEVICE = {
  bezel: { w: 344, h: 264, r: 30 },
  screen: { w: 312, h: 232, r: 16 },
};

/** The circle the screen grows from: it just holds the network. */
const SEED_SCREEN = { w: 236, h: 236, r: 118 };

const NODE_COUNT = 9;

// The forms, in phase order (see scenePhase): 0 the seed, 1 the plain
// network, and from 2 one per principle, so card i shows form i + 2.
const DEVICE_CONFIG = 3;
export const INTERVIEWER_CONFIG = 3;
const LIST_CONFIG = 4;
export const WORKFLOW_CONFIG = 5;

const node = (
  x: number,
  y: number,
  shape: Shape,
  w: number,
  color: NodeColor,
  outline = false,
): Pose => ({ x, y, shape, w, color, outline });

// Positions of the small network.
const P = [
  [-6, -6],
  [-68, -46],
  [6, -79],
  [70, -42],
  [85, 29],
  [29, 72],
  [-42, 68],
  [-88, 13],
  [39, 4],
] as const;

// The types the network takes on: people (circles), places (squares) and
// organisations (diamonds), in four colours.
const typed: Pose[] = (
  [
    ['circle', 17, 1],
    ['square', 15, 4],
    ['diamond', 18, 5],
    ['circle', 15, 1],
    ['square', 15, 4],
    ['diamond', 18, 5],
    ['circle', 15, 1],
    ['circle', 13, 3],
    ['square', 13, 3],
  ] as const
).map(([shape, w, color], i) => node(P[i]![0], P[i]![1], shape, w, color));

// Rounded, because these reach the server-rendered markup: a browser's sine
// can differ from Node's in the last digit, and hydration would see the
// difference.
const fixed1 = (v: number) => Number(v.toFixed(1));
const fixed2 = (v: number) => Number(v.toFixed(2));

/** Slots of the node list, in reading order: three rows of three. */
export const LIST_SLOTS = [-34, 22, 78].flatMap((y) =>
  [-58, 0, 58].map((x) => ({ x, y })),
);
const LIST_SIZE = 21;
/**
 * Where a list item's entrance starts, after the interview's NodeList: at 60%
 * scale, a fifth of its height below its slot. The network's nodes fly to
 * exactly this pose, so the list's spring picks each one up where it lands.
 */
export const LIST_ENTER = { scale: 0.6, y: LIST_SIZE * 2 * 0.2 };

// Where the list's items rest, at full size in their slots: the network's
// nodes leave the list from here, as each item hands over to its node.
const listSettled = typed.map((pose, i) => ({
  ...pose,
  x: LIST_SLOTS[i]!.x,
  y: LIST_SLOTS[i]!.y,
  w: LIST_SIZE,
}));

/**
 * The end-to-end workflow, as three stations on one line. The protocol is a
 * document being drafted: a timeline of stages down its right-hand side,
 * each stage with the node type it defines, and a slot for the next. The
 * interview is the device. The data is a table whose rows the line writes,
 * with an arrow that exports it. The line runs down the protocol's timeline,
 * behind the device, and down the table's first column.
 *
 * The page and the table sit at the device's opposite corners, a little clear
 * of it and overlapping its height equally, so the three read as one diagonal.
 * That keeps the whole workflow (WORKFLOW_BOX) about 700 units wide and 600
 * tall: at the workflow's zoom it fits a 480-unit view with its margin, and a
 * view as short as a 1280×720 window's, without the camera standing back.
 */
export const PROTOCOL = {
  x: -333,
  y: -328,
  w: 150,
  h: 260,
  /** The page's folded corner. */
  fold: 20,
  /** Architect's icon, at the head of the page. */
  badge: { x: -321, y: -318, size: 32 },
  /** The timeline, and the stages along it. */
  spineX: -219,
  rows: [-258, -204, -150],
  /** The empty slot for the next stage. */
  nextRow: -96,
  card: { x: -321, w: 72, h: 38 },
};

export const TABLE = {
  x: 183,
  y: 68,
  w: 150,
  h: 200,
  /** The first column, which the line runs down. */
  spineX: 219,
  headerY: 86,
  rows: [132, 186, 240],
  /** The rule after the first column, and the cells' bars. */
  ruleX: 249,
  cells: [
    { x: 261, w: 26 },
    { x: 299, w: 22 },
  ],
  /** The export arrow leaves the table's right-hand side. */
  exportTo: 363,
};

/** Interviewer's icon, at the head of the device's screen. */
export const INTERVIEWER_BADGE = { x: -146, y: -106, size: 32 };

// The three node types, as the workflow carries them.
const WORKFLOW_TYPES = [
  ['circle', 21, 1],
  ['square', 20, 4],
  ['diamond', 23, 5],
] as const;

type Point = { x: number; y: number };
type LineStep = {
  to: Point;
  /** Control points: the step is a cubic curve. */
  via?: [Point, Point];
  /** Behind the device: drawn quickly, since it cannot be seen. */
  hidden?: boolean;
  mark?: 'definition' | 'next' | 'emerge' | 'row';
};

const BEZEL_HALF = DEVICE.bezel.w / 2;
const pageBottom = PROTOCOL.y + PROTOCOL.h;

/** Where the workflow line starts: the top of the protocol's timeline. */
export const WORKFLOW_START = { x: PROTOCOL.spineX, y: PROTOCOL.y + 20 };

const lineSteps: LineStep[] = [
  ...PROTOCOL.rows.map((y): LineStep => ({
    to: { x: PROTOCOL.spineX, y },
    mark: 'definition',
  })),
  { to: { x: PROTOCOL.spineX, y: PROTOCOL.nextRow }, mark: 'next' },
  { to: { x: PROTOCOL.spineX, y: pageBottom } },
  {
    via: [
      { x: PROTOCOL.spineX, y: -24 },
      { x: -195, y: 0 },
    ],
    to: { x: -BEZEL_HALF, y: 0 },
  },
  { to: { x: BEZEL_HALF, y: 0 }, hidden: true, mark: 'emerge' },
  {
    via: [
      { x: 195, y: 0 },
      { x: TABLE.spineX, y: 24 },
    ],
    to: { x: TABLE.spineX, y: TABLE.y },
  },
  ...TABLE.rows.map((y): LineStep => ({
    to: { x: TABLE.spineX, y },
    mark: 'row',
  })),
];

// The line as a path, and as a fine polyline measured along its length.
const workflowTrace = (() => {
  let d = `M${WORKFLOW_START.x} ${WORKFLOW_START.y}`;
  const points: Point[] = [WORKFLOW_START];
  const hidden: boolean[] = [];
  const marks: { mark: NonNullable<LineStep['mark']>; point: number }[] = [];
  let from = WORKFLOW_START;
  for (const step of lineSteps) {
    const { to, via } = step;
    if (via) {
      const [c1, c2] = via;
      d += `C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${to.x} ${to.y}`;
      for (let n = 1; n <= 32; n += 1) {
        const t = n / 32;
        const u = 1 - t;
        points.push({
          x:
            u ** 3 * from.x +
            3 * u * u * t * c1.x +
            3 * u * t * t * c2.x +
            t ** 3 * to.x,
          y:
            u ** 3 * from.y +
            3 * u * u * t * c1.y +
            3 * u * t * t * c2.y +
            t ** 3 * to.y,
        });
        hidden.push(step.hidden ?? false);
      }
    } else {
      if (to.x === from.x) d += `V${to.y}`;
      else if (to.y === from.y) d += `H${to.x}`;
      else d += `L${to.x} ${to.y}`;
      points.push(to);
      hidden.push(step.hidden ?? false);
    }
    if (step.mark) marks.push({ mark: step.mark, point: points.length - 1 });
    from = to;
  }
  const lengths = [0];
  for (let k = 1; k < points.length; k += 1) {
    const a = points[k - 1]!;
    const b = points[k]!;
    lengths.push(lengths[k - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = lengths.at(-1)!;
  const fractions = lengths.map((length) => length / total);
  // Drawing time: the part behind the device goes by at a fifth of the pace.
  const times = [0];
  for (let k = 1; k < points.length; k += 1) {
    const span = fractions[k]! - fractions[k - 1]!;
    times.push(times[k - 1]! + span * (hidden[k - 1] ? 0.2 : 1));
  }
  const totalTime = times.at(-1)!;
  return {
    d,
    points,
    fractions,
    times: times.map((time) => time / totalTime),
    marks,
  };
})();

export const WORKFLOW_LINE = workflowTrace.d;

const markFractions = (mark: NonNullable<LineStep['mark']>) =>
  workflowTrace.marks
    .filter((m) => m.mark === mark)
    .map((m) => workflowTrace.fractions[m.point]!);

/** How far along the line (0–1) each of its stations lies. */
export const WORKFLOW_MARKS = {
  definitions: markFractions('definition'),
  next: markFractions('next')[0]!,
  /** Where the line comes out from behind the device. */
  emerge: markFractions('emerge')[0]!,
  rows: markFractions('row'),
};

// Interpolates `to` at a position on `from`, a rising list of positions.
function lookup(from: number[], to: number[], value: number) {
  if (value <= 0) return to[0]!;
  if (value >= 1) return to.at(-1)!;
  let lo = 0;
  let hi = from.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (from[mid]! <= value) lo = mid;
    else hi = mid;
  }
  const span = from[hi]! - from[lo]!;
  const t = span === 0 ? 0 : (value - from[lo]!) / span;
  return lerp(to[lo]!, to[hi]!, t);
}

/** The point a fraction of the way along the workflow line. */
function pointOnLine(fraction: number): Point {
  const { fractions, points } = workflowTrace;
  const f = clamp01(fraction);
  let lo = 0;
  let hi = fractions.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (fractions[mid]! <= f) lo = mid;
    else hi = mid;
  }
  const span = fractions[hi]! - fractions[lo]!;
  const t = span === 0 ? 0 : (f - fractions[lo]!) / span;
  const a = points[lo]!;
  const b = points[hi]!;
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

// How far along the line its tip is, a share of the way through drawing it.
const drawnAt = (time: number) =>
  lookup(workflowTrace.times, workflowTrace.fractions, clamp01(time));

// --- The community -------------------------------------------------------------

export const COMMUNITY_CONFIG = 6;

/** Everyone in the community is a person of one size and one plain colour. */
const PERSON_SIZE = 46;
const PERSON_COLOR: NodeColor = 0;
/** The gap between two people side by side in an institution. */
const PERSON_GAP = 20;
/** How far an institution's outline stands off its people. */
const BLOB_PADDING = 27;
/**
 * How softly the people's outlines merge: neighbours join with a slight
 * waist between them rather than a straight edge.
 */
const BLOB_SOFTNESS = 15;

/**
 * The institutions round the project, each a group of the network's people
 * (by node), stood evenly round its centre: from `from` (degrees, clockwise
 * from the right) one person after another, a person's width and the gap
 * apart. A lab of four above the device to the left, the heaviest group, on
 * the side away from the cards; a team of three below to the right; and a
 * pair to the left, a little below the device. Each gathers the people
 * nearest it in the workflow, in their order: the protocol's definitions
 * and the top of the device join the lab, the table's rows the team, and
 * the rest of the device the pair. Each stands far enough off the device
 * that its connection to the project shows.
 */
const INSTITUTION_LAYOUT = [
  { at: { x: -119, y: -354 }, from: -90, members: [0, 4, 2, 1] },
  { at: { x: 326, y: 318 }, from: -140, members: [6, 7, 8] },
  { at: { x: -370, y: 170 }, from: 150, members: [3, 5] },
] as const;

/** Where each person stands, by node, and which institution they join. */
const personAt: Point[] = [];
const institutionOf: number[] = [];
INSTITUTION_LAYOUT.forEach(({ at, from, members }, j) => {
  // People round a circle, neighbours a person's width and the gap apart.
  const spacing = 2 * PERSON_SIZE + PERSON_GAP;
  const radius = spacing / (2 * Math.sin(Math.PI / members.length));
  members.forEach((index, k) => {
    const angle = ((from + (360 * k) / members.length) * Math.PI) / 180;
    personAt[index] = {
      x: fixed1(at.x + radius * Math.cos(angle)),
      y: fixed1(at.y + radius * Math.sin(angle)),
    };
    institutionOf[index] = j;
  });
});

const BLOB_SAMPLES = 120;
// The outlines are rounded (see fixed1): they reach the server-rendered
// markup, and a browser's sine can differ from Node's in the last digit.

// An institution's outline is the smooth union of its people's circles,
// each stood off by the padding, so one person's circle merges into the next
// with a slight waist between them: where a smooth minimum of the distances
// to the circles is zero.
const BLOB_REACH = PERSON_SIZE + BLOB_PADDING;
const softDistance = (people: Point[], x: number, y: number) =>
  -BLOB_SOFTNESS *
  Math.log(
    people.reduce(
      (sum, p) =>
        sum +
        Math.exp(-(Math.hypot(x - p.x, y - p.y) - BLOB_REACH) / BLOB_SOFTNESS),
      0,
    ),
  );

// How far the outline lies from the institution's centre, in one direction.
function outlineReach(people: Point[], centre: Point, ux: number, uy: number) {
  let lo = 0;
  let hi = 4 * BLOB_REACH;
  for (let step = 0; step < 24; step += 1) {
    const mid = (lo + hi) / 2;
    if (softDistance(people, centre.x + mid * ux, centre.y + mid * uy) < 0) {
      lo = mid;
    } else hi = mid;
  }
  return lo;
}

// The outline, traced round the institution's centre.
const blobOutline = (people: Point[], centre: Point) =>
  Array.from({ length: BLOB_SAMPLES }, (_, k) => {
    const angle = (k / BLOB_SAMPLES) * TAU;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const reach = outlineReach(people, centre, ux, uy);
    return {
      x: fixed1(centre.x + reach * ux),
      y: fixed1(centre.y + reach * uy),
    };
  });

// The connection to the project starts this far inside the outline, beneath
// it, so contributions come out from under the institution.
const LINK_TUCK = 24;

// A closed curve through the midpoints of an outline's samples, each sample
// its control point: smooth all the way round.
function smoothPath(points: Point[]) {
  const mid = (a: Point, b: Point) =>
    `${fixed1((a.x + b.x) / 2)} ${fixed1((a.y + b.y) / 2)}`;
  const last = points.at(-1)!;
  let d = `M${mid(last, points[0]!)}`;
  points.forEach((p, k) => {
    d += `Q${p.x} ${p.y} ${mid(p, points[(k + 1) % points.length]!)}`;
  });
  return `${d}Z`;
}

/**
 * The institutions as drawn: each one's people and centre, its outline, and
 * where it stands. Each is connected straight to the project at the world's
 * origin: the connection (from `link`) runs beneath the institution and the
 * device, so it shows only between the two.
 */
export const INSTITUTIONS = INSTITUTION_LAYOUT.map(({ at, members }) => {
  const people = members.map((index) => personAt[index]!);
  const outline = blobOutline(people, at);
  const length = Math.hypot(at.x, at.y);
  const ux = -at.x / length;
  const uy = -at.y / length;
  const start = outlineReach(people, at, ux, uy) - LINK_TUCK;
  return {
    members: [...members],
    people,
    centre: at,
    link: { x: fixed1(at.x + start * ux), y: fixed1(at.y + start * uy) },
    outline,
    d: smoothPath(outline),
    bounds: {
      left: Math.min(...outline.map((p) => p.x)),
      right: Math.max(...outline.map((p) => p.x)),
      top: Math.min(...outline.map((p) => p.y)),
      bottom: Math.max(...outline.map((p) => p.y)),
    },
  };
});

/** The project at the centre of the community: a quiet disc on the device. */
export const PROJECT_RADIUS = 40;

// The move into the community, in two beats. First every node becomes a
// person where it stands: its shape, colour and outline change in place, at
// the workflow's size, while the line and the device's edges clear. Then the
// people travel to their institutions, one institution after another, on
// straight paths that keep their order, growing to full size only once they
// are well under way, so no two meet on the way; each is marked as a person
// as they land, and their institution gathers round them once they have.
const BECOME_FROM = 0.04;
const BECOME_SPAN = 0.24;
const SET_OFF = 0.3;
const JOURNEY = 0.38;
const INSTITUTION_STAGGER = 0.05;
/** A person's size as they change and set off: the workflow's nodes'. */
const SETTING_OFF_SIZE = 21;
/** The share of the journey before a person starts to grow. */
const GROW_AFTER = 0.35;
/** The share of the journey after which a person's figure shows. */
const FIGURE_AFTER = 0.7;

/** Where in the move institution j's people land. */
const landsAt = (j: number) => SET_OFF + INSTITUTION_STAGGER * j + JOURNEY;

function communityMove(i: number, t: number) {
  const journey = clamp01(
    (t - (landsAt(institutionOf[i] ?? 0) - JOURNEY)) / JOURNEY,
  );
  return {
    /** How far the node has become a person (0–1), in place. */
    become: smoothstep((t - BECOME_FROM) / BECOME_SPAN),
    /** How far along their path the person is. */
    along: smoothstep(journey),
    /** How far the person has grown from their setting-off size. */
    grown: smoothstep((journey - GROW_AFTER) / (1 - GROW_AFTER)),
    figure: smoothstep((journey - FIGURE_AFTER) / (1 - FIGURE_AFTER)),
  };
}

// --- The interview -------------------------------------------------------------

/**
 * The person the interview adds: one of the network's nine, a person at the
 * top right of the screen. On the way into the interview it empties to a
 * dashed slot; the participant's answer fills it.
 */
export const ANSWER = 3;

/** Where the answer lands: the person's place in the network. */
export const ANSWER_SLOT = { x: typed[ANSWER]!.x, y: typed[ANSWER]!.y };

/** The person's size, in the slot and in the answer. */
export const ANSWER_SIZE = typed[ANSWER]!.w;

/** The person's colour, in the slot, the prompt and the answer. */
export const ANSWER_COLOR = typed[ANSWER]!.color;

/**
 * A speech bubble: a rounded body, and a tail that leaves one of its upper
 * corners (`corner`), between two angles on its rounding (in degrees, 0
 * pointing right and 90 down), and points to where its speaker sits. `bow`
 * curves the tail, its sign choosing the side.
 */
export type Bubble = {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  tail: {
    corner: 'left' | 'right';
    from: number;
    to: number;
    tip: Point;
    bow: number;
  };
};

// The two speakers sit side by side at the device's near edge, at its middle.
const SPEAKERS_Y = 147;
const BUBBLE_TOP = 160;
const BUBBLE_HEIGHT = 68;

/**
 * The interview's two voices, below the device on one baseline, each tail
 * rising to its speaker: the two sit side by side at the device's near edge.
 * The interviewer speaks first, on the left, in a bubble that carries the
 * prompt; the participant answers on the right, in a softer, rounder one.
 */
export const PROMPT_BUBBLE: Bubble = {
  x: -216,
  y: BUBBLE_TOP,
  w: 180,
  h: BUBBLE_HEIGHT,
  r: 20,
  tail: {
    corner: 'right',
    from: -64,
    to: -14,
    tip: { x: -15, y: SPEAKERS_Y },
    bow: 3,
  },
};

export const ANSWER_BUBBLE: Bubble = {
  x: 36,
  y: BUBBLE_TOP,
  w: 116,
  h: BUBBLE_HEIGHT,
  r: BUBBLE_HEIGHT / 2,
  tail: {
    corner: 'left',
    from: 206,
    to: 238,
    tip: { x: 15, y: SPEAKERS_Y },
    bow: -3,
  },
};

const BUBBLE_MIDDLE = BUBBLE_TOP + BUBBLE_HEIGHT / 2;

/**
 * The prompt the interviewer reads out: two lines of the question, then the
 * blank it asks about, dashed as the person's slot on the screen is, and a
 * question mark.
 */
export const PROMPT = {
  lines: [
    { x: -196, y: BUBBLE_MIDDLE - 10, w: 80 },
    { x: -196, y: BUBBLE_MIDDLE + 10, w: 52 },
  ],
  blank: { x: -89, y: BUBBLE_MIDDLE },
  mark: { x: -61, y: BUBBLE_MIDDLE },
};

/**
 * What the participant says: a line, and the person named, at the end of the
 * bubble, who leaves it for the screen. The line stays.
 */
export const ANSWER_LINE = {
  x: ANSWER_BUBBLE.x + 22,
  y: BUBBLE_MIDDLE,
  w: 34,
};

export const ANSWER_SAID = {
  x: ANSWER_BUBBLE.x + ANSWER_BUBBLE.w - ANSWER_BUBBLE.r,
  y: BUBBLE_MIDDLE,
};

/**
 * The dashed slot the interview asks to fill, on the screen and in the
 * prompt: just inside the person's own outline, so the person covers it.
 */
export const SLOT_RADIUS = ANSWER_SIZE - 1.65;
export const SLOT_STROKE = 3.3;
// The slot's inner edge: the person shows the slot only once smaller.
const SLOT_INNER = SLOT_RADIUS - SLOT_STROKE / 2;

// A point on a corner's rounding, rounded (see fixed1).
function onRounding(cx: number, cy: number, r: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: fixed2(cx + r * Math.cos(radians)),
    y: fixed2(cy + r * Math.sin(radians)),
  };
}

/** A bubble's outline, drawn clockwise from its upper edge. */
export function bubbleOutline({ x, y, w, h, r, tail }: Bubble) {
  const right = x + w;
  const bottom = y + h;
  const a = `${r} ${r}`;
  const cx = tail.corner === 'right' ? right - r : x + r;
  const base = [
    onRounding(cx, y + r, r, tail.from),
    onRounding(cx, y + r, r, tail.to),
  ] as const;
  // Each side of the tail runs straight for its tip, bowed to one side.
  const { tip, bow } = tail;
  const dx = tip.x - (base[0].x + base[1].x) / 2;
  const dy = tip.y - (base[0].y + base[1].y) / 2;
  const length = Math.hypot(dx, dy);
  const control = (p: Point) =>
    `${fixed2(p.x + (tip.x - p.x) * 0.5 + (dy / length) * bow)} ${fixed2(p.y + (tip.y - p.y) * 0.5 - (dx / length) * bow)}`;
  const spout = `A${a} 0 0 1 ${base[0].x} ${base[0].y}Q${control(base[0])} ${tip.x} ${tip.y}Q${control(base[1])} ${base[1].x} ${base[1].y}`;
  const upperRight = tail.corner === 'right' ? spout : '';
  const upperLeft = tail.corner === 'left' ? spout : '';
  return `M${x + r} ${y}H${right - r}${upperRight}A${a} 0 0 1 ${right} ${y + r}V${bottom - r}A${a} 0 0 1 ${right - r} ${bottom}H${x + r}A${a} 0 0 1 ${x} ${bottom - r}V${y + r}${upperLeft}A${a} 0 0 1 ${x + r} ${y}Z`;
}

// The answer's way from the participant's bubble up into its slot: in over
// the device's lower edge clear of its corner, up the right of the network
// clear of its other nodes, and curling in to land.
const FLIGHT: [Point, Point, Point, Point] = [
  ANSWER_SAID,
  { x: 130, y: 96 },
  { x: 150, y: -74 },
  ANSWER_SLOT,
];

function answerFlight(u: number): Point {
  const [p0, p1, p2, p3] = FLIGHT;
  const v = 1 - u;
  return {
    x:
      v ** 3 * p0.x +
      3 * v * v * u * p1.x +
      3 * v * u * u * p2.x +
      u ** 3 * p3.x,
    y:
      v ** 3 * p0.y +
      3 * v * v * u * p1.y +
      3 * v * u * u * p2.y +
      u ** 3 * p3.y,
  };
}

/**
 * The answer's trail: dots along its way, from clear of the participant's
 * bubble to clear of the slot's mark, each with the share of the way (`u`)
 * the answer has come when it passes. They stay once it has landed, so the
 * still shows which way the answer went.
 */
export const ANSWER_TRAIL = Array.from({ length: 9 }, (_, j) => {
  const u = 0.16 + j * 0.085;
  const p = answerFlight(u);
  return { u, x: fixed2(p.x), y: fixed2(p.y) };
});

// Configurations in phase order: 0 the collapsed seed the network grows from,
// 1 the plain network read with the introduction, 2–6 the five principles.
const poses: Pose[][] = [
  // Seed: a faint knot of the network, before it grows.
  P.map(([x, y]) => node(x * 0.12, y * 0.12, 'circle', 3.2, 0)),

  // A simple network: one kind of node, one kind of edge.
  P.map(([x, y]) => node(x, y, 'circle', 15, 0)),

  // Ontological flexibility: the same network, now with types.
  typed,

  // Interviewer-assisted: unchanged; a screen forms around it. One person
  // waits to be named (see interviewPose).
  typed,

  // An emphasis on design: the nodes leave the network for the list.
  typed.map((pose, i) => ({
    ...pose,
    x: LIST_SLOTS[i]!.x,
    y: LIST_SLOTS[i]!.y + LIST_ENTER.y,
    w: LIST_SIZE * LIST_ENTER.scale,
  })),

  // End-to-end workflow: the same three types, defined on the protocol's
  // timeline, collected on the device and written to the table's rows. The
  // definitions and the rows wait for the line (see workflowPose).
  [
    ...PROTOCOL.rows.map((y, i) => {
      const [shape, w, color] = WORKFLOW_TYPES[i]!;
      return node(PROTOCOL.spineX, y, shape, w, color, true);
    }),
    node(-80, 40, 'circle', 21, 1),
    node(-5, -52, 'square', 20, 4),
    node(82, 28, 'diamond', 23, 5),
    ...TABLE.rows.map((y, i) => {
      const [shape, w, color] = WORKFLOW_TYPES[i]!;
      return node(TABLE.spineX, y, shape, w, color);
    }),
  ],

  // Open-source community: people, all alike, grouped by institution round
  // the project on the device (see INSTITUTIONS).
  personAt.map(({ x, y }) => node(x, y, 'circle', PERSON_SIZE, PERSON_COLOR)),
];

const CONFIG_COUNT = poses.length;
const LAST_PHASE = CONFIG_COUNT - 1;
/** The form a phase rests on. */
export const formAt = (phase: number) =>
  Math.min(LAST_PHASE, Math.max(0, Math.round(phase)));

// Map continuous reading position onto a staircase: each principle holds its
// form for most of its card and the scene moves only around the boundaries.
function stair(q: number) {
  const whole = Math.floor(q);
  return whole + smoothstep((q - whole - 0.28) / 0.44);
}

/**
 * The scene's phase from the reader's position. `entry` (0 to 1) is how far
 * the first card has come up to the reading line; `focus` is the reading
 * position through the cards, in cards (0.5 is the middle of the first). The
 * network grows in (form 0 to 1) with `entry` and takes on its types (form 2)
 * as the first card is read; each later card moves the scene on by one form,
 * so card `i` shows form `i + 2`.
 */
export function scenePhase(entry: number, focus: number, cardCount: number) {
  const reading =
    focus < 0.5
      ? smoothstep((focus - 0.08) / 0.37)
      : 1 + stair(Math.min(cardCount - 1, focus - 0.5));
  return entry + reading;
}

/**
 * The colour each form is keyed to: the light on the canvas behind the scene
 * and the bar on the principle's card. The five principles walk round the
 * palette, from the node types' purple through Interviewer's coral to the
 * community's blue. Each glows on the dark canvas (a yellow would turn brown).
 */
export const FORM_COLORS = [
  'slate-blue',
  'slate-blue',
  'purple-pizazz',
  'neon-coral',
  'neon-carrot',
  'sea-green',
  'sea-serpent',
] as const;

/** The two forms a phase lies between, and how far it has moved (eased). */
export function formBlend(phase: number) {
  const { index, t } = segment(phase);
  return { from: index, to: index + 1, mix: smoothstep(t) };
}

// The key colours' hues (oklch, from the palette in
// tooling/tailwind/shared/colors.css).
export const KEY_HUES: Record<(typeof FORM_COLORS)[number], number> = {
  'slate-blue': 281,
  'purple-pizazz': 320.46,
  'neon-coral': 11.57,
  'neon-carrot': 49,
  'sea-green': 171.52,
  'sea-serpent': 230,
};

/** Two key colours are neighbours, and mix well, within this many degrees. */
const NEIGHBOUR_HUES = 60;

const hueApart = (a: number, b: number) => {
  const apart = Math.abs(a - b) % 360;
  return Math.min(apart, 360 - apart);
};

/** Whether the light cross-fades from form `from` to form `to`. */
export const lightCrossFades = (from: number, to: number) =>
  hueApart(KEY_HUES[FORM_COLORS[from]!], KEY_HUES[FORM_COLORS[to]!]) <
  NEIGHBOUR_HUES;

/**
 * The canvas light's two layers mid-move. Between neighbouring colours (and
 * forms lit alike) the light cross-fades straight through, so the canvas
 * never goes dark; otherwise the outgoing colour goes out before the
 * incoming one comes up, so two colours far apart never mix on the canvas.
 */
export function lightLevels(phase: number) {
  const { from, to, mix } = formBlend(phase);
  if (lightCrossFades(from, to)) return { from, to, out: 1 - mix, in: mix };
  return {
    from,
    to,
    out: 1 - smoothstep(mix / 0.5),
    in: smoothstep((mix - 0.5) / 0.5),
  };
}

type Box = { x: number; y: number; w: number; h: number };
type Camera = {
  x: number;
  y: number;
  s: number;
  /** A box that must be seen whole: on a short canvas the camera pulls back. */
  fit?: Box;
};

/** The view is this wide, centred on the origin; its height follows the canvas. */
export const VIEW_WIDTH = 480;
/** The least margin round a box the camera fits, as a share of the view's shorter side. */
const VIEW_MARGIN = 0.065;

/**
 * Everything the workflow shows, from the protocol's corner to the end of
 * the export arrow.
 */
const WORKFLOW_BOX: Box = {
  x: PROTOCOL.x,
  y: PROTOCOL.y,
  w: TABLE.exportTo - PROTOCOL.x,
  h: TABLE.y + TABLE.h - PROTOCOL.y,
};

const boxAround = (left: number, top: number, right: number, bottom: number) =>
  ({ x: left, y: top, w: right - left, h: bottom - top }) satisfies Box;

// How far a shape's outline reaches from its centre along either axis, per
// unit of half-width (the shapes are symmetric under a quarter turn).
const axisReach = (shape: Shape) =>
  Math.max(
    ...ANGLES.map((angle, k) =>
      Math.abs(unitRadii[shape][k]! * Math.cos(angle)),
    ),
  ) / UNIT;

const poseReach = (pose: Pose) => pose.w * axisReach(pose.shape);

// The box round a form's nodes, at rest.
function nodesBox(config: number) {
  const reach = poseReach;
  const nodes = poses[config]!;
  return boxAround(
    Math.min(...nodes.map((pose) => pose.x - reach(pose))),
    Math.min(...nodes.map((pose) => pose.y - reach(pose))),
    Math.max(...nodes.map((pose) => pose.x + reach(pose))),
    Math.max(...nodes.map((pose) => pose.y + reach(pose))),
  );
}

const DEVICE_BOX = boxAround(
  -DEVICE.bezel.w / 2,
  -DEVICE.bezel.h / 2,
  DEVICE.bezel.w / 2,
  DEVICE.bezel.h / 2,
);

// The interview: the device, and the bodies of the two voices below it
// (their tails rise between them, inside the box). The box reaches as far to
// either side as the furthest of them, so the device, not the pair of voices,
// stands at the centre of the canvas, clear of the card beside it.
function interviewBox() {
  const reach = Math.max(
    -PROMPT_BUBBLE.x,
    ANSWER_BUBBLE.x + ANSWER_BUBBLE.w,
    DEVICE_BOX.x + DEVICE_BOX.w,
  );
  return boxAround(
    -reach,
    DEVICE_BOX.y,
    reach,
    PROMPT_BUBBLE.y + PROMPT_BUBBLE.h,
  );
}

/**
 * Everything each form shows, at rest, which its camera frames: the
 * network's nodes, the device and the list on its screen, the device and the
 * bodies of the interview's two voices below it (their tails rise between
 * them, inside the box), the workflow's stations, and the community's
 * institutions round the project.
 */
export const FORM_BOXES: Partial<Record<number, Box>> = {
  0: nodesBox(1),
  1: nodesBox(1),
  2: nodesBox(2),
  3: interviewBox(),
  4: DEVICE_BOX,
  5: WORKFLOW_BOX,
  6: boxAround(
    Math.min(DEVICE_BOX.x, ...INSTITUTIONS.map((i) => i.bounds.left)),
    Math.min(DEVICE_BOX.y, ...INSTITUTIONS.map((i) => i.bounds.top)),
    Math.max(-DEVICE_BOX.x, ...INSTITUTIONS.map((i) => i.bounds.right)),
    Math.max(-DEVICE_BOX.y, ...INSTITUTIONS.map((i) => i.bounds.bottom)),
  ),
};

// A camera centred on what its form shows, so the margins round it are
// even; `s` is its zoom wherever the canvas has room.
const framing = (config: number, s: number): Camera => {
  const box = FORM_BOXES[config]!;
  return { x: box.x + box.w / 2, y: box.y + box.h / 2, s, fit: box };
};

const cameras: Camera[] = [
  // The seed grows into the network where the network will stand.
  framing(0, 1.75),
  framing(1, 1.75),
  framing(2, 1.75),
  framing(3, 1.2),
  framing(4, 1.15),
  framing(5, 0.6),
  framing(6, 0.5),
];

// The camera's zoom in a view `viewHeight` tall.
function zoom(camera: Camera, viewHeight: number) {
  if (!camera.fit) return camera.s;
  const margin = 2 * VIEW_MARGIN * Math.min(VIEW_WIDTH, viewHeight);
  return Math.min(
    camera.s,
    (VIEW_WIDTH - margin) / camera.fit.w,
    (viewHeight - margin) / camera.fit.h,
  );
}

// The share of each move the camera takes: pulling back to the interview and
// to the workflow, it arrives before the voices and the stations do, so none
// is cut off by the canvas's edge; leaving the interview, it recentres as the
// voices go, so the device never stands over an empty lower third.
const CAMERA_SPAN = [1, 1, 0.75, 0.5, 0.6, 1];

// Each node starts and finishes its move a little after the one before, so
// the network flows into each form instead of moving in lockstep.
const STAGGER = 0.3;

// Where in each move the nodes set off: leaving the interview, the edges
// and props clear first. (The move into the community has its own timing:
// see communityMove.)
const NODE_START = [0, 0, 0, 0.3, 0];

function segment(phase: number) {
  const p = Math.min(LAST_PHASE, Math.max(0, phase));
  const index = Math.min(CONFIG_COUNT - 2, Math.floor(p));
  return { index, t: p - index };
}

function nodeProgress(i: number, t: number, index: number) {
  const start = NODE_START[index] ?? 0;
  const u = clamp01((t - start) / (1 - start));
  const delay = (i / (NODE_COUNT - 1)) * STAGGER;
  return smoothstep((u - delay) / (1 - STAGGER));
}

// A bump that peaks two thirds of the way through a move and is gone by its
// end: the shape of an overshoot that settles.
const settle = (k: number) => 6.75 * k * k * (1 - k);

// The moves that land with a pop, by the form they leave: the network bursts
// out of its seed past its resting places and settles back, and nodes swell
// as they take on their types.
const BURST = [0.16];
const SWELL = [0.35, 0.32];

/** How far along its move node i has travelled, overshoot included. */
function travel(index: number, k: number) {
  return k + (BURST[index] ?? 0) * settle(k);
}

/**
 * The camera as an SVG transform from world units into a view `viewHeight`
 * tall (and VIEW_WIDTH wide).
 */
export function cameraTransform(phase: number, viewHeight = VIEW_WIDTH) {
  const { index, t } = segment(phase);
  const a = cameras[index]!;
  const b = cameras[index + 1]!;
  const k = smoothstep(t / (CAMERA_SPAN[index] ?? 1));
  // Zoom interpolates geometrically, so a pull-back feels even throughout.
  const s = Math.exp(
    lerp(Math.log(zoom(a, viewHeight)), Math.log(zoom(b, viewHeight)), k),
  );
  const x = lerp(a.x, b.x, k);
  const y = lerp(a.y, b.y, k);
  return `scale(${s.toFixed(4)}) translate(${(-x).toFixed(2)} ${(-y).toFixed(2)})`;
}

// --- The workflow, read --------------------------------------------------------

const WORKFLOW_CARD = WORKFLOW_CONFIG - 2;
// The line draws through this stretch of its card (in cards), once the
// stations have settled; the rows and the export follow it, so the workflow
// is complete by the middle of the card.
const READ_FROM = 0.16;
const READ_SPAN = 0.32;
const LINE_SHARE = 0.78;

/**
 * How far the reader has taken the workflow (0–1): nothing until the form
 * has settled, then it follows the reading of the card, so the line draws
 * as the words are read. `focus` is the reading position in cards (see
 * scenePhase); a reader who has read every card has taken it all the way.
 */
function workflowProgress(phase: number, focus: number) {
  const settled =
    phase >= WORKFLOW_CONFIG
      ? 1
      : smoothstep((phase - (WORKFLOW_CONFIG - 0.12)) / 0.1);
  return settled * clamp01((focus - (WORKFLOW_CARD + READ_FROM)) / READ_SPAN);
}

/**
 * The visible stretch of the workflow line, as fractions of its length: it
 * draws from its start as the card is read (`head`), and leaves forwards,
 * its tail running out through its end, on the way to the community.
 */
export function workflowLine(phase: number, focus: number) {
  const progress = workflowProgress(phase, focus);
  const head = drawnAt(progress / LINE_SHARE);
  const { index, t } = segment(phase);
  const tail = index === WORKFLOW_CONFIG ? drawnAt(smoothstep(t / 0.4)) : 0;
  return { progress, head, tail: Math.min(head, tail) };
}

/** How present a station's mark is once the line's tip reaches `at`. */
export const markShown = (head: number, at: number) =>
  smoothstep((head - at + 0.02) / 0.05);

/** How much of table row `row` is written: after its node has landed. */
export const rowWritten = (progress: number, row: number) =>
  smoothstep((progress - LINE_SHARE - 0.02 - row * 0.04) / 0.06);

/** How much of the export arrow is drawn: last of all. */
export const exportDrawn = (progress: number) =>
  smoothstep((progress - 0.9) / 0.1);

// The workflow's pose for node i, with the line's tip at `head`: the
// definitions grow on the timeline as the tip reaches them, and the data
// rides the line out of the device, one row's spacing apart, so all three
// land in their rows as the tip reaches the last.
function workflowPose(i: number, head: number): Pose {
  const pose = poses[WORKFLOW_CONFIG]![i]!;
  const { definitions, emerge, rows } = WORKFLOW_MARKS;
  if (i < 3) return { ...pose, w: pose.w * markShown(head, definitions[i]!) };
  if (i < 6) return pose;
  const row = rows[i - 6]!;
  const along = head - (1 - row);
  return {
    ...pose,
    ...pointOnLine(Math.min(row, Math.max(emerge, along))),
    w: pose.w * smoothstep((along - emerge) / 0.04),
  };
}

// --- Nodes ---------------------------------------------------------------------

// A node's paint layers: one per colour it wears in any form, plus a dashed
// outline per colour it is drawn as a definition. Outlines are on top.
type NodeLayer = { key: string; color: NodeColor; outline: boolean };

const layerKey = (pose: Pose) => `${pose.outline ? 'o' : 'f'}${pose.color}`;

export const nodeLayers: NodeLayer[][] = Array.from(
  { length: NODE_COUNT },
  (_, i) => {
    const seen = new Map<string, NodeLayer>();
    for (const config of poses) {
      const pose = config[i]!;
      const key = layerKey(pose);
      if (!seen.has(key)) {
        seen.set(key, {
          key,
          color: pose.color,
          outline: pose.outline ?? false,
        });
      }
    }
    const layers = [...seen.values()];
    return [
      ...layers.filter((layer) => !layer.outline),
      ...layers.filter((layer) => layer.outline),
    ];
  },
);

export type NodeFrame = {
  /** The outline at unit size, centred on the origin. */
  d: string;
  x: number;
  y: number;
  /** Scale from the unit outline to the node's size. */
  scale: number;
  /** Opacity of each of the node's layers. */
  layers: number[];
  /** Opacity of the person's figure drawn over the node, in the community. */
  figure: number;
};

// Nodes that stay on the device into the workflow; the rest leave the list by
// shrinking where they are, and reappear on the protocol and in the table.
const staysOnDevice = (i: number) => i >= 3 && i < 6;

type Placement = {
  x: number;
  y: number;
  w: number;
  /** The poses moved between, and how far (0–1) the node has changed. */
  a: Pose;
  b: Pose;
  k: number;
  /** The node is at one pose only (`b` is ignored). */
  single: boolean;
  swell: number;
  figure: number;
};

/**
 * Where node i is at `phase`. An edge asks for its ends (`forEdge`): the
 * interview's answer is then always in its slot, so the edges that meet it
 * stay put while it is on its way there.
 */
function placement(
  i: number,
  phase: number,
  focus: number,
  forEdge = false,
): Placement {
  const { index, t } = segment(phase);
  const { head } = workflowLine(phase, focus);
  const at = (config: number) => {
    if (config === WORKFLOW_CONFIG) return workflowPose(i, head);
    if (config === INTERVIEWER_CONFIG && !forEdge) {
      return interviewPose(i, phase, focus);
    }
    return poses[config]![i]!;
  };
  const a = index === LIST_CONFIG ? listSettled[i]! : at(index);
  const b = at(index + 1);
  // The person the interview asks about stays put on the way in, and leaves
  // on the interview's own cues (see interviewPose).
  const k =
    index === INTERVIEWER_CONFIG - 1 && i === ANSWER
      ? 1
      : nodeProgress(i, t, index);

  if (index === LIST_CONFIG && !staysOnDevice(i)) {
    const shrink = smoothstep(k / 0.4);
    const pose = shrink < 1 ? a : b;
    const w = shrink < 1 ? a.w * (1 - shrink) : b.w;
    return {
      x: pose.x,
      y: pose.y,
      w,
      a: pose,
      b: pose,
      k: 0,
      single: true,
      swell: 0,
      figure: 0,
    };
  }

  if (index === WORKFLOW_CONFIG) {
    const { become, along, grown, figure } = communityMove(i, t);
    return {
      x: lerp(a.x, b.x, along),
      y: lerp(a.y, b.y, along),
      w: lerp(lerp(a.w, SETTING_OFF_SIZE, become), b.w, grown),
      a,
      b,
      k: become,
      single: false,
      swell: 0,
      figure,
    };
  }

  const m = travel(index, k);
  return {
    x: lerp(a.x, b.x, m),
    y: lerp(a.y, b.y, m),
    w: lerp(a.w, b.w, k),
    a,
    b,
    k,
    single: false,
    swell: (SWELL[index] ?? 0) * settle(k),
    figure: 0,
  };
}

// A layer's share as a node changes from pose a to pose b. A colour change
// happens in a short window mid-move, the new colour over the old, which
// holds, so a node never shows a mix of two colours for long. A definition
// fills in beneath its dashed outline, on its page (see the scene's
// NetworkNode), and only then does the outline go: the outline is whole
// while the fill comes, and the fill whole while the outline goes.
function layerWeights(layers: NodeLayer[], a: Pose, b: Pose, k: number) {
  const keyA = layerKey(a);
  const keyB = layerKey(b);
  if (keyA === keyB) return layers.map((layer) => (layer.key === keyA ? 1 : 0));
  if (a.outline || b.outline) {
    // From a's side of the move to b's: the fill is there for the second
    // half of the change from an outline, and the first half of the change
    // to one.
    const filled = a.outline
      ? smoothstep(k / 0.5)
      : 1 - smoothstep((k - 0.5) / 0.5);
    const outlined = a.outline
      ? 1 - smoothstep((k - 0.5) / 0.5)
      : smoothstep(k / 0.5);
    return layers.map((layer) => {
      if (layer.key !== keyA && layer.key !== keyB) return 0;
      return layer.outline ? outlined : filled;
    });
  }
  const kc = smoothstep((k - 0.45) / 0.15);
  const upper = layers.findIndex((layer) => layer.key === keyB);
  const lower = layers.findIndex((layer) => layer.key === keyA);
  return layers.map((_, l) => {
    if (upper > lower) {
      if (l === lower) return kc < 1 ? 1 : 0;
      if (l === upper) return kc;
    } else {
      if (l === upper) return kc > 0 ? 1 : 0;
      if (l === lower) return 1 - kc;
    }
    return 0;
  });
}

/**
 * Node i's frame at `phase`. `focus` is the reading position (see
 * workflowProgress); it moves only the workflow's definitions and data.
 */
export function nodeFrame(
  i: number,
  phase: number,
  focus = Number.POSITIVE_INFINITY,
): NodeFrame {
  const place = placement(i, phase, focus);
  const { a, b, k } = place;
  // A node growing from (or shrinking to) nothing keeps the other shape.
  let d: string;
  if (place.single || a.shape === b.shape) d = restingOutline(a.shape);
  else if (a.w === 0) d = restingOutline(b.shape);
  else if (b.w === 0) d = restingOutline(a.shape);
  else d = unitOutline(a.shape, b.shape, k);

  const layers = nodeLayers[i]!;
  const weights = place.single
    ? layers.map((layer) => (layer.key === layerKey(a) ? 1 : 0))
    : layerWeights(layers, a, b, k);
  // Nodes shrinking to nothing also fade, so no speck is left behind.
  const fade = smoothstep(place.w / 4);
  return {
    d,
    x: place.x,
    y: place.y,
    scale: (place.w / UNIT) * (1 + place.swell),
    layers: weights.map((weight) => weight * fade),
    figure: place.figure,
  };
}

// --- The interview, read --------------------------------------------------------

const INTERVIEW_CARD = INTERVIEWER_CONFIG - 2;
// The interview's three beats, each a stretch of its card (in cards, from the
// card's start): the interviewer asks, the participant answers, and, after a
// moment, the answer is recorded on the screen. They begin once the device
// has formed and are done by the middle of the card, where the form holds.
const BEATS = {
  ask: { from: 0.13, span: 0.12 },
  answer: { from: 0.26, span: 0.12 },
  record: { from: 0.42, span: 0.14 },
};

// The share of the ask in which the prompt's blank appears, and the person it
// asks about empties from the screen with it.
const ASKED = 0.35;

// The share of the record beat the answer spends on its way to the slot; the
// rest marks it there and fills the prompt's blank.
const LANDED = 0.75;

export type InterviewBeats = { ask: number; answer: number; record: number };

/**
 * How far the reader has taken each of the interview's beats (0–1, linear):
 * nothing until the device has formed, then each follows the reading of the
 * card, as the workflow's line does. A reader who has read every card has
 * seen them all.
 */
export function interviewBeats(phase: number, focus: number): InterviewBeats {
  const settled =
    phase >= INTERVIEWER_CONFIG
      ? 1
      : smoothstep((phase - (INTERVIEWER_CONFIG - 0.12)) / 0.1);
  const read = ({ from, span }: { from: number; span: number }) =>
    settled * clamp01((focus - (INTERVIEW_CARD + from)) / span);
  return {
    ask: read(BEATS.ask),
    answer: read(BEATS.answer),
    record: read(BEATS.record),
  };
}

/**
 * How far the interviewer has asked (0–1): the prompt's blank pops in, and
 * the person it asks about empties from the screen as it does.
 */
export const asked = (ask: number) => smoothstep(ask / ASKED);

/**
 * A bubble's size as it opens from its tail: past full size and back, the
 * pop a speech bubble makes.
 */
export const bubbleOpen = (k: number) => {
  const v = clamp01(k);
  return v + 0.14 * settle(v);
};

/** The participant's bubble's size as they answer: it opens with the answer in it. */
export const answerOpen = (answer: number) => bubbleOpen(smoothstep(answer));

/** How far the answer has come on its way to the slot (0–1, eased out). */
function answerFlown(record: number) {
  const r = clamp01(record / LANDED);
  return r * (2 - r);
}

/**
 * The interview's pose for node i. The person the interview asks about
 * empties from the screen as the interviewer asks; the participant's bubble
 * opens with them in it, and, recorded, they leave it, lifting a little as
 * they go, and land in their slot.
 */
function interviewPose(i: number, phase: number, focus: number): Pose {
  const pose = poses[INTERVIEWER_CONFIG]![i]!;
  if (i !== ANSWER) return pose;
  const { ask, answer, record } = interviewBeats(phase, focus);
  if (record > 0) {
    const u = answerFlown(record);
    return { ...pose, ...answerFlight(u), w: pose.w * (1 + 0.5 * u * (1 - u)) };
  }
  if (answer > 0) {
    // Carried by the bubble as it opens from its tail's tip.
    const s = answerOpen(answer);
    const { tip } = ANSWER_BUBBLE.tail;
    return {
      ...pose,
      x: tip.x + (ANSWER_SAID.x - tip.x) * s,
      y: tip.y + (ANSWER_SAID.y - tip.y) * s,
      w: pose.w * s,
    };
  }
  return { ...pose, w: pose.w * (1 - asked(ask)) };
}

// The stretch of the move out of the interview over which its marks leave.
const INTERVIEW_LEAVE = 0.3;

/**
 * How present the answer's empty slot is: it shows once the person emptying
 * from it is smaller than its inner edge (so it never peeks out from under
 * them), and goes once the answer covers it, or as the reader moves on.
 */
export function answerSlotShown(phase: number, focus: number) {
  const { index, t } = segment(phase);
  if (index !== INTERVIEWER_CONFIG - 1 && index !== INTERVIEWER_CONFIG) {
    return 0;
  }
  const { ask, record } = interviewBeats(phase, focus);
  if (record >= LANDED) return 0;
  const radius = ANSWER_SIZE * (1 - asked(ask));
  const shown = smoothstep((SLOT_INNER - radius) / (SLOT_INNER * 0.4));
  return index === INTERVIEWER_CONFIG
    ? shown * (1 - smoothstep(t / INTERVIEW_LEAVE))
    : shown;
}

/**
 * How far the answer is recorded once it has landed (0–1): a ring marks it
 * on the screen, as the interview marks a selected node, and the prompt's
 * blank fills. The ring goes as the reader moves on.
 */
export function answerRecorded(phase: number, focus: number) {
  const { record } = interviewBeats(phase, focus);
  return smoothstep((record - LANDED) / (1 - LANDED));
}

export function answerMarked(phase: number, focus: number) {
  const { index, t } = segment(phase);
  if (index !== INTERVIEWER_CONFIG) return 0;
  return answerRecorded(phase, focus) * (1 - smoothstep(t / INTERVIEW_LEAVE));
}

/**
 * How present trail dot `j` is: it appears as the answer passes it, and goes
 * with the voices as the reader moves on.
 */
export function trailShown(j: number, phase: number, focus: number) {
  const { record } = interviewBeats(phase, focus);
  const u = record > 0 ? answerFlown(record) : 0;
  return smoothstep((u - ANSWER_TRAIL[j]!.u) / 0.05) * (1 - voicesGone(phase));
}

/**
 * How far the interviewer's bubble has arrived: late in the move in, as the
 * device's frame draws from the speakers' side.
 */
export function promptArrived(phase: number) {
  const { index, t } = segment(phase);
  if (index === INTERVIEWER_CONFIG - 1) return smoothstep((t - 0.6) / 0.3);
  return index === INTERVIEWER_CONFIG ? 1 : 0;
}

/**
 * How far both voices have gone (0–1): as the camera pushes in to the list
 * they fade and sink, before the nodes set off.
 */
export function voicesGone(phase: number) {
  const { index, t } = segment(phase);
  if (index === INTERVIEWER_CONFIG) return smoothstep(t / INTERVIEW_LEAVE);
  return index > INTERVIEWER_CONFIG ? 1 : 0;
}

// Where in the move into the community the workflow's stations start to
// fade: once their people have set off from them.
const STATIONS_LEAVE = 0.5;

/**
 * Scenery cross-fades without overlap: the outgoing form's props are gone by
 * the midpoint of the move and the incoming ones arrive after it. The
 * workflow's stations, which the community has no props to make way for,
 * stay until the people have left them.
 */
export function sceneryWeight(config: number, phase: number) {
  const { index, t } = segment(phase);
  if (config === index) {
    return (
      1 -
      smoothstep(
        index === WORKFLOW_CONFIG ? (t - STATIONS_LEAVE) / 0.25 : t / 0.45,
      )
    );
  }
  if (config === index + 1) return smoothstep((t - 0.55) / 0.45);
  return 0;
}

/**
 * How far institution j has gathered round its people (0–1): as soon as
 * they have landed, one institution after another.
 */
export function institutionShown(j: number, phase: number) {
  const { index, t } = segment(phase);
  if (index !== COMMUNITY_CONFIG - 1) return 0;
  return smoothstep((t - landsAt(j)) / 0.15);
}

/**
 * How far the project has grown (0–1) on the device: out of its centre, as
 * the people leave it for their institutions.
 */
export function projectShown(phase: number) {
  const { index, t } = segment(phase);
  if (index !== COMMUNITY_CONFIG - 1) return 0;
  return smoothstep((t - 0.45) / 0.3);
}

export type DeviceFrame = {
  screen: { w: number; h: number; r: number; opacity: number };
  /** `opacity` is the fill's; the frame's line draws round it. */
  bezel: { w: number; h: number; r: number; opacity: number; drawn: number };
};

/**
 * The device forms around the network on the way into the interview: a
 * circle just holding the network becomes the rounded screen, filling in as
 * the camera pulls back, and the bezel's line draws round it. From then on
 * it stays.
 */
export function deviceFrame(phase: number): DeviceFrame {
  const p = Math.min(LAST_PHASE, Math.max(0, phase));
  const k =
    p >= DEVICE_CONFIG
      ? 1
      : p <= DEVICE_CONFIG - 1
        ? 0
        : p - (DEVICE_CONFIG - 1);
  const shape = smoothstep(k / 0.6);
  const fill = smoothstep((k - 0.15) / 0.35);
  // The frame's line draws only once the screen it goes round has its size;
  // the frame's fill is there before it, hidden under the screen.
  const rim = smoothstep((k - 0.58) / 0.32);
  const frame = smoothstep((k - 0.4) / 0.15);
  const screen = {
    w: lerp(SEED_SCREEN.w, DEVICE.screen.w, shape),
    h: lerp(SEED_SCREEN.h, DEVICE.screen.h, shape),
    r: lerp(SEED_SCREEN.r, DEVICE.screen.r, shape),
    opacity: fill,
  };
  const pad = (DEVICE.bezel.w - DEVICE.screen.w) / 2;
  return {
    screen,
    bezel: {
      w: screen.w + pad * 2 * rim,
      h: screen.h + pad * 2 * rim,
      r: lerp(screen.r, DEVICE.bezel.r, rim),
      opacity: frame,
      drawn: rim,
    },
  };
}

/** Whether node i is resting in its list slot (arrived, and not yet left). */
export function inListSlot(i: number, phase: number) {
  const { index, t } = segment(phase);
  if (index === LIST_CONFIG - 1) return nodeProgress(i, t, index) > 0.97;
  if (index === LIST_CONFIG) return nodeProgress(i, t, index) < 0.03;
  return false;
}

// The list items' outlines, sampled once.
const listOutlines = typed.map((pose, i) =>
  outlineFrom(
    LIST_SLOTS[i]!.x,
    LIST_SLOTS[i]!.y,
    sampleRadii(pose.shape, LIST_SIZE),
  ),
);

/** A static outline for a node drawn outside the morph (the list items). */
export const listItemOutline = (i: number) => listOutlines[i]!;

export const listItemColor = (i: number) => typed[i]!.color;

// --- Edges -----------------------------------------------------------------

type EdgeStyle = { stroke: string };
type EdgeUse = { config: number; style: number; bend: number };

export type EdgeSpec = {
  key: string;
  a: number;
  b: number;
  styles: EdgeStyle[];
  uses: EdgeUse[];
};

// Every edge is a solid line, its type shown by its colour.
const plain: EdgeStyle = { stroke: 'stroke-text/35' };
const solid = (stroke: string): EdgeStyle => ({ stroke });

// [a, b, style, bend]. Positive bend curves away from the world origin.
type EdgeRow = [number, number, EdgeStyle, number?];

// Edge thickness in world units, in proportion to each form's node size.
const EDGE_WIDTH: Record<number, number> = {
  1: 2.6,
  2: 2.6,
  3: 4.5,
  5: 5,
};

const simplePairs: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 8],
  [0, 6],
  [0, 7],
  [1, 7],
  [1, 2],
  [2, 3],
  [3, 8],
  [8, 4],
  [4, 5],
  [5, 6],
  [8, 5],
];

// The typed network keeps fewer connections than the plain one: those it
// drops retract as it takes on its types.
const typedEdges: EdgeRow[] = [
  [0, 1, solid('stroke-edge-1')],
  [0, 8, solid('stroke-edge-1')],
  [0, 6, solid('stroke-edge-3')],
  [0, 7, solid('stroke-edge-2')],
  [1, 2, solid('stroke-edge-9'), 0.12],
  [3, 8, solid('stroke-edge-3')],
  [8, 4, solid('stroke-edge-1')],
  [5, 6, solid('stroke-edge-2'), 0.12],
  [8, 5, solid('stroke-edge-7')],
];

const edgeRows: Record<number, EdgeRow[]> = {
  1: simplePairs.map(([a, b]): EdgeRow => [a, b, plain, 0.06]),
  2: typedEdges,
  // The interview collects the same network.
  3: typedEdges,
  // The device's own small network, in the edge palette.
  5: [
    [3, 4, solid('stroke-edge-1'), 0.1],
    [4, 5, solid('stroke-edge-9'), 0.1],
    [3, 5, solid('stroke-edge-3'), 0.1],
  ],
};

export const edges: EdgeSpec[] = (() => {
  const byKey = new Map<string, EdgeSpec>();
  for (const [configKey, rows] of Object.entries(edgeRows)) {
    const config = Number(configKey);
    for (const [a, b, style, bend = 0] of rows) {
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      let spec = byKey.get(key);
      if (!spec) {
        spec = { key, a, b, styles: [], uses: [] };
        byKey.set(key, spec);
      }
      let styleIndex = spec.styles.findIndex((s) => s.stroke === style.stroke);
      if (styleIndex === -1) {
        spec.styles.push(style);
        styleIndex = spec.styles.length - 1;
      }
      spec.uses.push({ config, style: styleIndex, bend });
    }
  }
  return [...byKey.values()];
})();

/** One of an edge's strokes: its opacity, and how much of it is drawn. */
export type EdgeStrokeFrame = { opacity: number; drawn: number };

export type EdgeFrame = {
  d: string;
  /** How much of the edge shows (0–1), whichever stroke shows it. */
  drawn: number;
  width: number;
  strokes: EdgeStrokeFrame[];
};

const UNDRAWN: EdgeFrame = { d: 'M0 0', drawn: 0, width: 0, strokes: [] };

// Edges leaving into a form without them retract in this share of the move,
// before the nodes set off (see NODE_START).
const EDGE_RETRACT = 0.3;

/**
 * The edge's path, width, and each stroke's state. Strokes draw and retract
 * along the edge and are never part-transparent; a new colour draws over the
 * old, which holds beneath it. An edge new to a form draws once both its
 * nodes have nearly landed.
 */
export function edgeFrame(
  edge: EdgeSpec,
  phase: number,
  focus = Number.POSITIVE_INFINITY,
): EdgeFrame {
  const { index, t } = segment(phase);
  const from = edge.uses.find((use) => use.config === index);
  const to = edge.uses.find((use) => use.config === index + 1);
  if (!from && !to) return UNDRAWN;

  const strokes: EdgeStrokeFrame[] = edge.styles.map(() => ({
    opacity: 0,
    drawn: 0,
  }));
  const show = (style: number, amount: number) => {
    strokes[style] = { opacity: amount > 0 ? 1 : 0, drawn: amount };
  };
  let width: number;
  let bend: number;
  if (from && to) {
    const k = smoothstep(t);
    width = lerp(
      EDGE_WIDTH[from.config] ?? 2.6,
      EDGE_WIDTH[to.config] ?? 2.6,
      k,
    );
    bend = lerp(from.bend, to.bend, k);
    if (from.style === to.style) show(from.style, 1);
    else if (to.style > from.style) {
      // The upper of the two strokes draws over (or retracts off) the lower,
      // which holds.
      strokes[from.style] = { opacity: k < 1 ? 1 : 0, drawn: 1 };
      strokes[to.style] = { opacity: k > 0 ? 1 : 0, drawn: k };
    } else {
      strokes[to.style] = { opacity: k > 0 ? 1 : 0, drawn: 1 };
      strokes[from.style] = { opacity: k < 1 ? 1 : 0, drawn: 1 - k };
    }
  } else if (from) {
    width = EDGE_WIDTH[from.config] ?? 2.6;
    bend = from.bend;
    show(from.style, 1 - smoothstep(t / EDGE_RETRACT));
  } else {
    const use = to!;
    width = EDGE_WIDTH[use.config] ?? 2.6;
    bend = use.bend;
    const landed = Math.min(
      nodeProgress(edge.a, t, index),
      nodeProgress(edge.b, t, index),
    );
    show(use.style, smoothstep((landed - 0.55) / 0.45));
  }

  let drawn = 0;
  for (const stroke of strokes) {
    if (stroke.opacity > 0) drawn = Math.max(drawn, stroke.drawn);
  }
  // An edge out of every form keeps one constant path: nothing to repaint.
  if (drawn < 0.002) return UNDRAWN;

  const a = placement(edge.a, phase, focus, true);
  const b = placement(edge.b, phase, focus, true);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  let nx = -(b.y - a.y);
  let ny = b.x - a.x;
  if (nx * mx + ny * my < 0) {
    nx = -nx;
    ny = -ny;
  }
  return {
    d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)}Q${(mx + nx * bend).toFixed(1)} ${(my + ny * bend).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
    drawn: Math.min(1, drawn),
    width,
    strokes,
  };
}
