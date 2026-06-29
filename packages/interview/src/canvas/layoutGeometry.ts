// Pixel-space geometry for the canvas auto-layout engine.
//
// Node positions are stored NORMALIZED 0-1 and rendered with
// `left: x*100%` / `top: y*100%`, so x maps to canvas WIDTH and y to canvas
// HEIGHT. Running collision in normalized (or isotropic "sim") space therefore
// renders a circular collision zone as a flattened ellipse on a non-square
// canvas, collapsing the vertical gap. To keep spacing visually isotropic the
// simulation runs in PIXELS derived from the live canvas dimensions; these
// helpers convert between the two spaces.

export type Position = { x: number; y: number };
export type CanvasDimensions = { width: number; height: number };

// Fallback rendered node radius (px) used until `useNodeMeasurement` reports the
// real measured size (e.g. on the first render, or under jsdom where layout is
// not computed). Matches `useCanvasStore`'s NODE_RADIUS: size="sm" is size-24 =
// 6 * --theme-root-size, which at the base 1rem theme root is 96px diameter ->
// 48px radius.
export const FALLBACK_NODE_RADIUS = 48;

// Extra px between a node's visible EDGE and a neighbour's edge, on top of the
// two radii. Chosen as 0.75 * radius so the center-to-center minimum is
// 2*radius + 1.5*radius, leaving an edge-to-edge channel of 1.5*radius (72px at
// the base 48px radius, 90px at the largest 60px radius) — a clearly visible
// channel for the edge line at every theme step, not merely "no overlap".
export const EDGE_GAP_RATIO = 0.75;

/**
 * Center-to-center collision radius (px) for one node. Two nodes both using this
 * radius cannot settle closer than `2 * collideRadius` center-to-center, which
 * is `2*nodeRadius + 2*EDGE_GAP_RATIO*nodeRadius` — guaranteeing a visible
 * edge channel regardless of canvas aspect ratio because the simulation is
 * isotropic in px.
 */
export const collideRadiusForNode = (nodeRadius: number): number =>
  nodeRadius * (1 + EDGE_GAP_RATIO);

// Minimum gap (px) between a node's visible edge and the canvas boundary. The
// edge-to-wall inset is this plus the node radius, so a node's edge never sits
// closer than EDGE_INSET_PADDING to the canvas boundary. Single source for both
// the worker's bounds force and the store's drag/placement clamp; their equality
// is what makes the store clamp a no-op after the simulation settles.
const EDGE_INSET_PADDING = 16;
export const edgeInsetForNode = (nodeRadius: number): number =>
  nodeRadius + EDGE_INSET_PADDING;

// Convert a normalized 0-1 position to pixel coordinates on a canvas of the
// given dimensions. Origin is the canvas top-left, matching the rendered
// `left/top` mapping.
export const toPixels = (pos: Position, dims: CanvasDimensions): Position => ({
  x: pos.x * dims.width,
  y: pos.y * dims.height,
});

// Convert pixel coordinates back to a normalized 0-1 position. Guards against a
// zero-size canvas (the caller should defer seeding until dimensions arrive,
// but a defensive 0 keeps this total).
export const toNormalized = (
  pos: Position,
  dims: CanvasDimensions,
): Position => ({
  x: dims.width === 0 ? 0 : pos.x / dims.width,
  y: dims.height === 0 ? 0 : pos.y / dims.height,
});

// True when canvas dimensions are usable for seeding the simulation.
export const hasUsableDimensions = (
  dims: CanvasDimensions | null,
): dims is CanvasDimensions =>
  dims !== null && dims.width > 0 && dims.height > 0;
