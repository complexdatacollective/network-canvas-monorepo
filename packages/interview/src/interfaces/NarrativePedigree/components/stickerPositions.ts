import type { NodeShape } from '@codaco/fresco-ui/Node';

export type StickerPosition = { x: number; y: number };

/**
 * Returns `count` positions around the perimeter of a unit bounding box [0,1]²,
 * ordered so that each position index is stable as count grows (prefix property).
 *
 * The coordinate space is normalised: (0,0) = top-left, (1,1) = bottom-right.
 * Callers multiply by the actual rendered node size to get pixel coordinates.
 *
 * Distribution strategy per shape:
 * - square:   corners first (CW from top-left), then edge-midpoints. Sticker
 *             centres sit exactly on the bounding-box boundary (50% overlap at
 *             corners; edge-midpoints achieve true 50% overlap).
 * - diamond:  face-midpoints first, then vertices, all on the rendered perimeter
 *             ring at R = 0.5 × DIAMOND_RENDER_SCALE = 0.425 (50% overlap).
 * - circle:   evenly spaced angles on the radius-0.5 ring (50% overlap).
 */
export function stickerPositions(
  shape: NodeShape,
  count: number,
): StickerPosition[] {
  if (count === 0) return [];
  if (shape === 'square') return SQUARE_ANCHORS.slice(0, count);
  if (shape === 'circle') return circlePerimeter(count);
  return DIAMOND_ANCHORS.slice(0, count);
}

/**
 * Square anchor ordering: corners first (CW from top-left), then edge-midpoints.
 * Sticker centres on corners sit exactly on the bounding-box boundary.
 */
const SQUARE_ANCHORS: StickerPosition[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 }, // corners CW from top-left
  { x: 0.5, y: 0 },
  { x: 1, y: 0.5 },
  { x: 0.5, y: 1 },
  { x: 0, y: 0.5 }, // edge-midpoints
];

/**
 * The rendered diamond is the square layer with `scale-[0.85] rotate-45` in
 * fresco-ui Node.tsx shapeLayerVariants. DIAMOND_RENDER_SCALE MUST track that
 * value: if Node.tsx changes the scale, this constant must change too.
 */
const DIAMOND_RENDER_SCALE = 0.85;

/** Half-perimeter radius of the rendered diamond in normalised [0,1]² space. */
const R = 0.5 * DIAMOND_RENDER_SCALE; // 0.425

/**
 * Distance from the centre to a face-midpoint along each axis.
 * A point on |dx|+|dy|=R at the face midpoint satisfies |dx|=|dy|=R/2.
 */
const half = R / 2; // 0.2125

/**
 * Diamond anchor ordering: face-midpoints first (best 50% overlap), then
 * vertices. All points lie on the rendered perimeter ring |x-0.5|+|y-0.5|=R.
 */
const DIAMOND_ANCHORS: StickerPosition[] = [
  { x: 0.5 - half, y: 0.5 - half },
  { x: 0.5 + half, y: 0.5 - half }, // top-left, top-right face midpoints
  { x: 0.5 + half, y: 0.5 + half },
  { x: 0.5 - half, y: 0.5 + half }, // bottom-right, bottom-left face midpoints
  { x: 0.5, y: 0.5 - R },
  { x: 0.5 + R, y: 0.5 }, // top, right vertices
  { x: 0.5, y: 0.5 + R },
  { x: 0.5 - R, y: 0.5 }, // bottom, left vertices
];

/**
 * Distributes `count` points evenly on the unit circle, then maps them into
 * [0,1]². Starting angle is 225° (top-left quadrant), proceeding clockwise
 * (increasing angle in screen coordinates where y-axis points down).
 * Supports up to any count — the circle has no discrete anchor limit.
 */
function circlePerimeter(count: number): StickerPosition[] {
  const positions: StickerPosition[] = [];
  const startAngleRad = (225 * Math.PI) / 180;
  const twoPi = 2 * Math.PI;

  for (let i = 0; i < count; i++) {
    const angle = startAngleRad + (twoPi * i) / count;
    // Map from [-1,1] to [0,1]
    const x = (Math.cos(angle) + 1) / 2;
    const y = (Math.sin(angle) + 1) / 2;
    positions.push({ x, y });
  }

  return positions;
}
