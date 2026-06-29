// Screen-normalised geometry for the canvas auto-layout engine.
//
// Node positions are stored NORMALIZED 0-1 and rendered with
// `left: x*100%` / `top: y*100%`, so x maps to canvas WIDTH and y to canvas
// HEIGHT. Running the simulation directly in normalized space renders a circular
// collision zone as a flattened ellipse on a non-square canvas, collapsing the
// vertical gap; running it in PIXELS keeps spacing isotropic but makes
// charge/centering scale with absolute canvas size (forceManyBody weakens as the
// canvas grows, so centering over-dominates on large screens).
//
// To get both isotropy AND screen-independent forces, the simulation runs in an
// ISOTROPIC, SCREEN-NORMALISED space: BOTH axes are scaled by the canvas HEIGHT
// H. From a normalized (nx, ny) on a W*H canvas: simX = nx * (W/H), simY = ny.
// With `aspect = W / H`, simX in [0, aspect] and simY in [0, 1]. The scale factor
// is uniform (H on both axes), so collision stays circular — the anisotropy that
// px-space fixed is not reintroduced. px-derived distances (collision, link,
// bounds inset) become sim distances by dividing by H, so they shrink (in sim
// units) on a larger canvas, giving proportionally more breathing room there
// while charge/centering — fixed in sim space — keep the layout SHAPE identical
// across canvas sizes.

export type Position = { x: number; y: number };
export type CanvasDimensions = { width: number; height: number };

// Fallback rendered node radius (px) used until `useNodeMeasurement` reports the
// real measured size (e.g. on the first render, or under jsdom where layout is
// not computed). Matches `useCanvasStore`'s NODE_RADIUS: size="sm" is size-24 =
// 6 * --theme-root-size, which at the base 1rem theme root is 96px diameter ->
// 48px radius.
export const FALLBACK_NODE_RADIUS = 48;

// Extra spacing between a node's visible EDGE and a neighbour's edge, expressed
// as a fraction of the node radius, on top of the two radii. The center-to-center
// minimum is 2*radius + 2*EDGE_GAP_RATIO*radius, so the edge-to-edge channel is
// 2*EDGE_GAP_RATIO*radius (= 0.8*radius at 0.4). Lowered from 0.75 to bring
// connected nodes ~twice as close (FIX 3): the collision floor is what stops
// linked nodes touching, so a smaller ratio lets links pull them tighter. Tune
// visually.
export const EDGE_GAP_RATIO = 0.4;

/**
 * Center-to-center collision radius (px) for one node. Two nodes both using this
 * radius cannot settle closer than `2 * collideRadius` center-to-center, which
 * is `2*nodeRadius + 2*EDGE_GAP_RATIO*nodeRadius` — guaranteeing a visible
 * edge channel. The caller divides this by the canvas height to obtain the
 * sim-space collision radius the worker uses.
 */
export const collideRadiusForNode = (nodeRadius: number): number =>
  nodeRadius * (1 + EDGE_GAP_RATIO);

// Minimum gap (px) between a node's visible edge and the canvas boundary. The
// edge-to-wall inset is this plus the node radius, so a node's edge never sits
// closer than EDGE_INSET_PADDING to the canvas boundary. Single source for both
// the worker's bounds force (after the caller divides by the canvas height) and
// the store's drag/placement clamp; their equality is what makes the store clamp
// a no-op after the simulation settles.
const EDGE_INSET_PADDING = 16;
export const edgeInsetForNode = (nodeRadius: number): number =>
  nodeRadius + EDGE_INSET_PADDING;

// Aspect ratio (width / height). The sim x-axis spans [0, aspect]; the y-axis
// spans [0, 1].
const aspectOf = (dims: CanvasDimensions): number => dims.width / dims.height;

// Convert a normalized 0-1 position to ISOTROPIC, SCREEN-NORMALISED simulation
// coordinates: both axes scaled by the canvas height. simX = nx * aspect,
// simY = ny. Equal px deltas in x and y therefore map to equal sim deltas, so
// collision stays circular.
export const toSim = (pos: Position, dims: CanvasDimensions): Position => ({
  x: pos.x * aspectOf(dims),
  y: pos.y,
});

// Convert simulation coordinates back to a normalized 0-1 position. Guards
// against a zero-size canvas (the caller should defer seeding until dimensions
// arrive, but a defensive 0 keeps this total).
export const fromSim = (pos: Position, dims: CanvasDimensions): Position => {
  if (dims.width === 0 || dims.height === 0) return { x: 0, y: 0 };
  return { x: pos.x / aspectOf(dims), y: pos.y };
};

// True when canvas dimensions are usable for seeding the simulation.
export const hasUsableDimensions = (
  dims: CanvasDimensions | null,
): dims is CanvasDimensions =>
  dims !== null && dims.width > 0 && dims.height > 0;
