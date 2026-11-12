import { layoutOffset } from './toolsThreadGeometry';

// The geometry of the Core Team section's thread: one curve that comes in from
// off screen, passes a node on every portrait card and ends on a node at the
// top of the Scientific Advisors panel. With the cards in two rows of four it
// weaves down from each top card to the card below; in a single column it runs
// down the cards' left edge. This module turns the cards' layout boxes into
// that curve, and the section's scroll position into how much of it is drawn.

type Point = { x: number; y: number };

/** A card's or the panel's layout box, relative to the thread's wrapper. */
export type Box = { left: number; top: number; width: number; height: number };

/** A node on the thread: the card it belongs to, or -1 for the panel. */
type Waypoint = Point & { card?: number };

export type ThreadDot = Point & {
  card: number;
  /** How far along the curve the dot sits. */
  at: number;
};

export type ThreadGeometry = {
  width: number;
  height: number;
  /** The SVG path. */
  d: string;
  /** The curve's length. */
  total: number;
  /** The nodes, in the order the thread reaches them. */
  dots: ThreadDot[];
};

/** The panel's node is not a card's. */
export const PANEL_DOT = -1;

const SAMPLES = 24;

const round = (value: number) => Math.round(value * 10) / 10;

function cubic(a: number, b: number, c: number, d: number, t: number) {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

/**
 * A smooth curve through every point (Catmull-Rom, written as cubic Béziers),
 * with the length along it at which it passes each point.
 */
export function smoothPath(points: readonly Point[]) {
  const first = points[0];
  if (!first) return { d: '', lengths: [], total: 0 };
  let d = `M ${round(first.x)} ${round(first.y)}`;
  const lengths = [0];
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (!p1 || !p2) continue;
    const p0 = points[i - 1] ?? p1;
    const p3 = points[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(p2.x)} ${round(p2.y)}`;
    let previous = p1;
    for (let s = 1; s <= SAMPLES; s += 1) {
      const t = s / SAMPLES;
      const next = {
        x: cubic(p1.x, c1.x, c2.x, p2.x, t),
        y: cubic(p1.y, c1.y, c2.y, p2.y, t),
      };
      total += Math.hypot(next.x - previous.x, next.y - previous.y);
      previous = next;
    }
    lengths.push(total);
  }
  return { d, lengths, total };
}

type ThreadLayout = {
  /** The portrait cards, in reading order. */
  cards: readonly Box[];
  /** The Scientific Advisors panel. */
  panel: Box;
  /** The wrapper's size. */
  width: number;
  height: number;
  /** How far the wrapper sits from the window's left edge. */
  offsetLeft: number;
};

const bottom = (box: Box) => box.top + box.height;
const centreX = (box: Box) => box.left + box.width / 2;

/**
 * The thread through the cards and down to the panel. Null without a card to
 * pass.
 */
export function layoutThread({
  cards,
  panel,
  width,
  height,
  offsetLeft,
}: ThreadLayout): ThreadGeometry | null {
  const first = cards[0];
  if (!first) return null;

  const points: Waypoint[] = [];
  const second = cards[1];
  const rows =
    second !== undefined &&
    Math.abs(second.top - first.top) < 2 &&
    cards.length >= 8;
  if (rows) {
    // Two rows of four: the thread enters from off screen at the left, then
    // weaves down from each top card to the card below it, leaves past the
    // right edge and swings back in to the panel.
    const offset = first.width * 0.22;
    points.push(
      { x: -offsetLeft - 40, y: first.top - 90 },
      { x: -28, y: first.top + first.height * 0.62 },
    );
    for (let k = 0; k < 4; k += 1) {
      const top = cards[k];
      const below = cards[k + 4];
      if (!top || !below) continue;
      points.push(
        { x: centreX(top) - offset, y: bottom(top), card: k },
        { x: centreX(below) + offset, y: below.top, card: k + 4 },
      );
    }
    const last = cards[7];
    if (last) {
      points.push(
        { x: width + 28, y: last.top + last.height * 0.55 },
        { x: width - 70, y: bottom(last) + 44 },
      );
    }
  } else {
    // One column: the thread runs down the cards' left edge, tucking in
    // above each card, and turns in to the panel.
    points.push({ x: -offsetLeft - 30, y: -80 });
    cards.forEach((card, k) => {
      if (k > 0) points.push({ x: card.left - 18, y: card.top - 9 });
      points.push({ x: card.left, y: card.top + card.height / 2, card: k });
    });
    points.push({ x: panel.left + 12, y: panel.top - 26 });
  }
  points.push({ x: width / 2, y: panel.top, card: PANEL_DOT });

  const { d, lengths, total } = smoothPath(points);
  const dots: ThreadDot[] = [];
  points.forEach(({ x, y, card }, index) => {
    if (card !== undefined) dots.push({ x, y, card, at: lengths[index] ?? 0 });
  });
  return { width, height, d, total, dots };
}

function boxOf(element: HTMLElement, wrapper: HTMLElement): Box {
  const { x, y } = layoutOffset(element, wrapper);
  return {
    left: x,
    top: y,
    width: element.offsetWidth,
    height: element.offsetHeight,
  };
}

/**
 * Reads the cards (`[data-thread-card]`) and the panel (`[data-thread-panel]`)
 * from `wrapper`'s layout. Null until both are in place.
 */
export function measureThread(wrapper: HTMLElement): ThreadGeometry | null {
  const panel = wrapper.querySelector<HTMLElement>('[data-thread-panel]');
  if (!panel) return null;
  return layoutThread({
    cards: [...wrapper.querySelectorAll<HTMLElement>('[data-thread-card]')].map(
      (card) => boxOf(card, wrapper),
    ),
    panel: boxOf(panel, wrapper),
    width: wrapper.offsetWidth,
    height: wrapper.offsetHeight,
    // The thread comes in from beyond the window's left edge.
    offsetLeft: wrapper.getBoundingClientRect().left,
  });
}

/**
 * The share of the thread drawn, from the wrapper's place in the window: none
 * while its top is below 82% of the window's height, all of it once its
 * bottom has risen to 55%.
 */
export function threadProgress(
  top: number,
  height: number,
  viewportHeight: number,
) {
  const start = viewportHeight * 0.82;
  const end = viewportHeight * 0.55;
  const progress = (start - top) / (height + start - end);
  return Math.max(0, Math.min(1, progress));
}

/** How many of the thread's nodes the drawn share has reached. */
export function reachedDots(geometry: ThreadGeometry, progress: number) {
  // A little slack, so the last node lights as the line arrives at it.
  const drawn = geometry.total * progress + 2;
  return geometry.dots.filter((dot) => dot.at <= drawn).length;
}
