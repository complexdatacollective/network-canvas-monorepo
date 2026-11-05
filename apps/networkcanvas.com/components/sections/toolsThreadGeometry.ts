import { type Tool, tools } from '~/lib/content';

// The geometry of the Tools section's thread: one network edge that leaves
// the heading, runs into Architect, forks to Interviewer (in person) and
// Fresco (on the web), and rejoins where the network data both routes produce
// is drawn. Anchors are zero-size markers the section places with CSS, so each
// breakpoint can route the thread differently; this module turns their layout
// positions into curves the section can draw and scrub.

const SAMPLES = 40;

export type AnchorId =
  | 'start'
  | 'architectIn'
  | 'architectOut'
  | 'interviewerIn'
  | 'interviewerOut'
  | 'frescoIn'
  | 'frescoOut'
  | 'end';

export const anchorIds: readonly AnchorId[] = [
  'start',
  'architectIn',
  'architectOut',
  'interviewerIn',
  'interviewerOut',
  'frescoIn',
  'frescoOut',
  'end',
];

type Point = { x: number; y: number };

export type ThreadColor = 'sea-green' | 'neon-coral' | 'slate-blue' | 'mustard';

export const threadColors: Record<ThreadColor, string> = {
  'sea-green': 'var(--color-sea-green)',
  'neon-coral': 'var(--color-neon-coral)',
  'slate-blue': 'var(--color-slate-blue)',
  'mustard': 'var(--color-mustard)',
};

// Only the open stretches between cards are drawn: a line running behind a
// card's glass would cross its text.
export const threadSegments: readonly {
  id: string;
  from: AnchorId;
  to: AnchorId;
  colors: readonly [ThreadColor, ThreadColor];
}[] = [
  {
    id: 'trunk',
    from: 'start',
    to: 'architectIn',
    colors: ['sea-green', 'sea-green'],
  },
  {
    id: 'to-interviewer',
    from: 'architectOut',
    to: 'interviewerIn',
    colors: ['sea-green', 'neon-coral'],
  },
  {
    id: 'to-fresco',
    from: 'architectOut',
    to: 'frescoIn',
    colors: ['sea-green', 'slate-blue'],
  },
  {
    id: 'from-interviewer',
    from: 'interviewerOut',
    to: 'end',
    colors: ['neon-coral', 'mustard'],
  },
  {
    id: 'from-fresco',
    from: 'frescoOut',
    to: 'end',
    colors: ['slate-blue', 'mustard'],
  },
];

export type SegmentGeometry = {
  id: string;
  d: string;
  from: Point;
  to: Point;
  // Lookup tables sampled along the curve: the y of each sample, the share of
  // the curve's length drawn by then, and the x there. They map the reading
  // line straight to a drawn length and a tip position.
  ys: number[];
  fractions: number[];
  xs: number[];
};

// Where a card's node sits inside the card, and the card's size: what its
// bloom is clipped from.
export type CardGeometry = { node: Point; width: number; height: number };

export type Geometry = {
  width: number;
  height: number;
  points: ReadonlyMap<AnchorId, Point>;
  segments: SegmentGeometry[];
  cards: ReadonlyMap<Tool['id'], CardGeometry>;
};

// The anchor where the thread arrives at each tool's card.
export const toolInAnchor: Record<Tool['id'], AnchorId> = {
  architect: 'architectIn',
  interviewer: 'interviewerIn',
  fresco: 'frescoIn',
};

function isAnchorId(value: string | undefined): value is AnchorId {
  return anchorIds.some((id) => id === value);
}

function isToolId(value: string | undefined): value is Tool['id'] {
  return tools.some((tool) => tool.id === value);
}

function layoutOffset(element: HTMLElement, ancestor: HTMLElement): Point {
  // Offsets stay in layout space, so the cards' own reveal motion can never
  // feed back into the thread's geometry.
  let x = 0;
  let y = 0;
  let current: HTMLElement | null = element;
  while (current && current !== ancestor) {
    x += current.offsetLeft;
    y += current.offsetTop;
    const parent: Element | null = current.offsetParent;
    current = parent instanceof HTMLElement ? parent : null;
  }
  return { x, y };
}

function cubic(a: number, b: number, c: number, d: number, t: number) {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

// Each leg is an S-curve with vertical tangents at both ends, the shape of an
// edge leaving one node straight down and arriving at the next straight down.
// A `viaX` detours the edge down a gutter, so a strand that has to pass a card
// it does not belong to runs beside it instead of behind its text.
function buildSegment(
  id: string,
  from: Point,
  to: Point,
  viaX?: number,
): SegmentGeometry {
  const waypoints: Point[] = [from];
  if (viaX !== undefined) {
    const turn = Math.min(56, (to.y - from.y) / 4);
    waypoints.push({ x: viaX, y: from.y + turn }, { x: viaX, y: to.y - turn });
  }
  waypoints.push(to);

  let d = `M ${from.x} ${from.y}`;
  const xs: number[] = [];
  const ys: number[] = [];
  const lengths: number[] = [];
  let total = 0;
  for (let leg = 1; leg < waypoints.length; leg += 1) {
    const a = waypoints[leg - 1];
    const b = waypoints[leg];
    if (!a || !b) continue;
    const midY = (a.y + b.y) / 2;
    d += ` C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y}`;
    for (let i = leg === 1 ? 0 : 1; i <= SAMPLES; i += 1) {
      const t = i / SAMPLES;
      const x = cubic(a.x, a.x, b.x, b.x, t);
      const y = cubic(a.y, midY, midY, b.y, t);
      const previousX = xs.at(-1);
      const previousY = ys.at(-1);
      if (previousX !== undefined && previousY !== undefined) {
        total += Math.hypot(x - previousX, y - previousY);
      }
      xs.push(x);
      // Keep the input range strictly increasing for the transforms.
      ys.push(previousY !== undefined ? Math.max(y, previousY + 0.001) : y);
      lengths.push(total);
    }
  }
  const fractions = lengths.map((length) => (total > 0 ? length / total : 1));
  return { id, d, from, to, xs, ys, fractions };
}

/**
 * Reads the thread's anchors (`[data-thread-anchor]`) and the cards it blooms
 * (`[data-thread-card]`) from `wrapper`'s layout. Null until every anchor is
 * in place.
 */
export function measureGeometry(wrapper: HTMLElement): Geometry | null {
  const points = new Map<AnchorId, Point>();
  for (const element of wrapper.querySelectorAll<HTMLElement>(
    '[data-thread-anchor]',
  )) {
    const id = element.dataset.threadAnchor;
    if (isAnchorId(id)) points.set(id, layoutOffset(element, wrapper));
  }
  if (points.size !== anchorIds.length) return null;

  const cards = new Map<Tool['id'], CardGeometry>();
  for (const box of wrapper.querySelectorAll<HTMLElement>(
    '[data-thread-card]',
  )) {
    const id = box.dataset.threadCard;
    if (!isToolId(id)) continue;
    const origin = layoutOffset(box, wrapper);
    const node = points.get(toolInAnchor[id]);
    if (!node) continue;
    cards.set(id, {
      node: { x: node.x - origin.x, y: node.y - origin.y },
      width: box.offsetWidth,
      height: box.offsetHeight,
    });
  }

  // In a single column Fresco sits below Interviewer, so the strand bound for
  // Fresco and the one leaving Interviewer each take a gutter past the other
  // card.
  const interviewerOut = points.get('interviewerOut');
  const frescoIn = points.get('frescoIn');
  const stacked =
    interviewerOut !== undefined &&
    frescoIn !== undefined &&
    frescoIn.y > interviewerOut.y;
  const gutters: Record<string, number> = stacked
    ? { 'to-fresco': wrapper.offsetWidth + 12, 'from-interviewer': -12 }
    : {};

  const built: SegmentGeometry[] = [];
  for (const segment of threadSegments) {
    const from = points.get(segment.from);
    const to = points.get(segment.to);
    if (!from || !to) return null;
    built.push(buildSegment(segment.id, from, to, gutters[segment.id]));
  }

  return {
    width: wrapper.offsetWidth,
    height: wrapper.offsetHeight,
    points,
    cards,
    segments: built,
  };
}
