import type { NodeShape } from '@codaco/fresco-ui/Node';

export type StickerPosition = { x: number; y: number };

/**
 * The rendered diamond is the square layer with `scale-[0.85] rotate-45` in
 * fresco-ui Node.tsx shapeLayerVariants. DIAMOND_RENDER_SCALE MUST track that
 * value: if Node.tsx changes the scale, this constant must change too.
 */
const DIAMOND_RENDER_SCALE = 0.85;

// Superellipse exponent approximating the node's rounded corners (≈24px radius
// on a 96px node, i.e. ~0.25 of the width). A higher value is squarer; ~4 keeps
// the corners as rounded as the real node so a corner-direction marker sits
// against the rounded corner instead of floating off the sharp mathematical
// corner. At every multiple of 45° (where all markers sit) the silhouette normal
// is radial, so a fixed radial push gives the SAME gap on every side.
const ROUND_EXP = 4;

/**
 * Distance from centre to a superellipse of "radius" `a` in direction `angle`.
 * `a` is the half-width along the axes; the rounded corners reach a little
 * further out along the diagonals (but far less than a sharp corner would).
 */
function superellipseRadius(a: number, angle: number): number {
  const c = Math.abs(Math.cos(angle));
  const s = Math.abs(Math.sin(angle));
  return a / (c ** ROUND_EXP + s ** ROUND_EXP) ** (1 / ROUND_EXP);
}

/**
 * Direction templates per marker count, in degrees of screen-space angle
 * (0° = right, 90° = bottom, growing clockwise). Each row is mirror-symmetric
 * about the vertical axis and biased to the corner directions (45/135/225/315),
 * because:
 *  - corners read distinctly per shape once projected onto the silhouette — a
 *    square lands its markers ON its corners, a diamond ON its faces, a circle
 *    evenly — so the placement visibly reflects the node shape; and
 *  - the connectors attach at the cardinal points (top = parent line,
 *    left/right = partner line, bottom = child descent), so corner directions
 *    keep the markers clear of them. The few cardinals used (for odd counts and
 *    counts > 4) start with the bottom, the least-contended.
 */
const ANGLE_TEMPLATES: Record<number, number[]> = {
  1: [90],
  2: [225, 315],
  3: [225, 315, 90],
  4: [225, 315, 135, 45],
  5: [225, 315, 135, 45, 90],
  6: [225, 315, 135, 45, 180, 0],
  7: [225, 315, 135, 45, 180, 0, 90],
  8: [225, 315, 135, 45, 180, 0, 90, 270],
};

/** Angles (radians) for `count` markers, symmetric about the vertical axis. */
function anglesForCount(count: number): number[] {
  const template = ANGLE_TEMPLATES[count];
  if (template) return template.map((deg) => (deg * Math.PI) / 180);
  // > 8 markers (rare): fall back to an even angular spread, half a step off
  // the bottom so it stays mirror-symmetric about the vertical axis.
  const step = (2 * Math.PI) / count;
  const start = Math.PI / 2 + step / 2;
  return Array.from({ length: count }, (_, i) => start + step * i);
}

/**
 * Returns the node's rendered-silhouette radius (distance from centre to the
 * rounded edge) at `angle`. Circle = constant; square = a rounded superellipse
 * (corner directions reach toward — but not all the way to — the corner);
 * diamond = the same rounded square scaled and rotated 45°, so its tips fall on
 * the cardinal axes and its faces on the diagonals.
 */
function silhouetteRadius(shape: NodeShape, angle: number): number {
  if (shape === 'circle') return 0.5;
  if (shape === 'square') return superellipseRadius(0.5, angle);
  // The diamond is the square rotated 45°: evaluate the superellipse in the
  // node's un-rotated frame (rotation preserves distance from centre).
  return superellipseRadius(0.5 * DIAMOND_RENDER_SCALE, angle - Math.PI / 4);
}

/**
 * Returns `count` points on the perimeter of a node centred in the unit box
 * [0,1]², placed at shape-defining anchor directions (corners first) and
 * projected onto the node's rounded silhouette, so the placement visibly
 * reflects the node shape: a square's markers reach toward its corners, a
 * diamond's toward its faces/tips, a circle's spread evenly. Because all anchors
 * sit at multiples of 45° (where the silhouette normal is radial), a fixed
 * radial push by the caller yields the SAME gap on every side. The layout is
 * symmetric about the vertical axis. The coordinate space is normalised:
 * (0,0) = top-left, (1,1) = bottom-right; callers multiply by the rendered node
 * size.
 *
 * Diamond tip points can fall slightly outside [0,1] because the rendered
 * diamond's tips extend past the bounding box — intentional, so the markers
 * track the visible shape. The caller pushes each point a little further out (by
 * a fraction of the marker size) to set the final overlap.
 */
export function stickerPositions(
  shape: NodeShape,
  count: number,
): StickerPosition[] {
  if (count <= 0) return [];
  return anglesForCount(count).map((angle) => {
    const r = silhouetteRadius(shape, angle);
    return { x: 0.5 + r * Math.cos(angle), y: 0.5 + r * Math.sin(angle) };
  });
}
