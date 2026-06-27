import type { NodeShape } from '@codaco/fresco-ui/Node';

export type StickerPosition = { x: number; y: number };

/**
 * Returns `count` positions around the perimeter of a unit bounding box [0,1]²,
 * starting at the top-left corner and proceeding clockwise.
 *
 * The coordinate space is normalised: (0,0) = top-left, (1,1) = bottom-right.
 * Callers scale these to the actual rendered node size.
 *
 * Distribution strategy per shape:
 * - square:   evenly spaced along the four sides (top → right → bottom ← left ↑)
 * - circle:   evenly spaced angles on the unit circle, first angle at 225° (top-left)
 * - diamond:  evenly spaced along the four edges of a rotated square, first at top-left
 */
export function stickerPositions(
  shape: NodeShape,
  count: number,
): StickerPosition[] {
  if (count === 0) return [];
  if (shape === 'square') return squarePerimeter(count);
  if (shape === 'circle') return circlePerimeter(count);
  return diamondPerimeter(count);
}

/**
 * Distributes `count` points evenly along the perimeter of the unit square.
 * The perimeter has total length 4. We start at the top-left corner (0, 0)
 * and travel clockwise: top edge → right edge → bottom edge → left edge.
 */
function squarePerimeter(count: number): StickerPosition[] {
  const positions: StickerPosition[] = [];
  const perimeter = 4;
  const step = perimeter / count;

  for (let i = 0; i < count; i++) {
    const t = i * step;
    positions.push(squareTToXY(t));
  }

  return positions;
}

/**
 * Converts a perimeter parameter t ∈ [0, 4) to (x, y) on the unit square.
 * t=0 is the top-left corner; travel is clockwise.
 * Segment mapping:
 *   0–1: top edge     (x increases from 0→1, y=0)
 *   1–2: right edge   (x=1, y increases from 0→1)
 *   2–3: bottom edge  (x decreases from 1→0, y=1)
 *   3–4: left edge    (x=0, y decreases from 1→0)
 */
function squareTToXY(t: number): StickerPosition {
  if (t < 1) return { x: t, y: 0 };
  if (t < 2) return { x: 1, y: t - 1 };
  if (t < 3) return { x: 1 - (t - 2), y: 1 };
  return { x: 0, y: 1 - (t - 3) };
}

/**
 * Distributes `count` points evenly on the unit circle, then maps them into
 * [0,1]². Starting angle is 225° (top-left quadrant, between top and left),
 * proceeding clockwise (increasing angle in screen coordinates where y-down).
 */
function circlePerimeter(count: number): StickerPosition[] {
  const positions: StickerPosition[] = [];
  const startAngleDeg = 225;
  const startAngleRad = (startAngleDeg * Math.PI) / 180;
  const twoPi = 2 * Math.PI;

  for (let i = 0; i < count; i++) {
    // Clockwise in screen space = increasing angle (y-axis points down)
    const angle = startAngleRad + (twoPi * i) / count;
    // Map from [-1,1] to [0,1]
    const x = (Math.cos(angle) + 1) / 2;
    const y = (Math.sin(angle) + 1) / 2;
    positions.push({ x, y });
  }

  return positions;
}

/**
 * Distributes `count` points along the perimeter of a diamond (rhombus) that
 * fits in the unit square. The diamond has four vertices:
 *   top:    (0.5, 0)
 *   right:  (1,   0.5)
 *   bottom: (0.5, 1)
 *   left:   (0,   0.5)
 *
 * We start at the top-left edge midpoint — the point on the top-left side
 * closest to the top-left corner, which is halfway along the first edge
 * (from top to right), adjusted so the first point is in the top-left region.
 * Specifically: start at t=0 which is the top vertex, but offset by a small
 * fraction so we begin in the top-left quadrant.
 *
 * Perimeter of the diamond = 4 × (distance between adjacent vertices) = 4 × √0.5 ≈ 2.83.
 * For distribution purposes we normalise to perimeter = 4 (treating each edge as length 1).
 *
 * Starting at the midpoint of the top-left edge (between top vertex and left vertex)
 * then going clockwise:  left → top → right → bottom → left.
 */
function diamondPerimeter(count: number): StickerPosition[] {
  const positions: StickerPosition[] = [];
  const perimeter = 4;
  // Start at t=3.5 (midpoint of the left→top edge, i.e. upper-left region)
  const startT = 3.5;
  const step = perimeter / count;

  for (let i = 0; i < count; i++) {
    const t = (((startT + i * step) % perimeter) + perimeter) % perimeter;
    positions.push(diamondTToXY(t));
  }

  return positions;
}

/**
 * Converts a perimeter parameter t ∈ [0, 4) to (x, y) on the unit-diamond.
 * Vertices:  top=(0.5,0), right=(1,0.5), bottom=(0.5,1), left=(0,0.5).
 * Segment mapping (clockwise):
 *   0–1: top → right    (x: 0.5→1, y: 0→0.5)
 *   1–2: right → bottom (x: 1→0.5, y: 0.5→1)
 *   2–3: bottom → left  (x: 0.5→0, y: 1→0.5)
 *   3–4: left → top     (x: 0→0.5, y: 0.5→0)
 */
function diamondTToXY(t: number): StickerPosition {
  if (t < 1) {
    const s = t;
    return { x: 0.5 + 0.5 * s, y: 0.5 * s };
  }
  if (t < 2) {
    const s = t - 1;
    return { x: 1 - 0.5 * s, y: 0.5 + 0.5 * s };
  }
  if (t < 3) {
    const s = t - 2;
    return { x: 0.5 - 0.5 * s, y: 1 - 0.5 * s };
  }
  const s = t - 3;
  return { x: 0.5 * s, y: 0.5 - 0.5 * s };
}
