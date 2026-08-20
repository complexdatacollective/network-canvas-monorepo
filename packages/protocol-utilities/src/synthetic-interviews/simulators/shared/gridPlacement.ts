export type CanvasPosition = { x: number; y: number };

/**
 * Where the Network Composer puts a node the participant has just added.
 *
 * A verbatim mirror of the interface's own placement
 * (`interview/src/interfaces/NetworkComposer/gridPlacement.ts`): the normalised
 * canvas is a grid read from the top left and wrapping into rows, kept clear of
 * the tool palette on the left and the attribute drawer on the right so a fresh
 * node lands in view. A cell counts as taken when a node already sits within
 * half a step of it, so deleting somebody frees their cell instead of stacking
 * the next arrival on top of them.
 *
 * Duplicated rather than imported because this package must never import
 * `@codaco/interview` — the dependency runs the other way, and closing the loop
 * is a proven Turbo cycle (design decision 13). These are the geometry of one
 * interface's canvas rather than a generation parameter: nothing here decides
 * what a value looks like, only where the interface would have put it.
 */
const GRID = {
  startX: 0.12,
  startY: 0.12,
  stepX: 0.1,
  stepY: 0.18,
  endX: 0.8,
  endY: 0.85,
} as const;

const COLUMNS = Math.max(
  1,
  Math.floor((GRID.endX - GRID.startX) / GRID.stepX) + 1,
);

const ROWS = Math.max(
  1,
  Math.floor((GRID.endY - GRID.startY) / GRID.stepY) + 1,
);

const CELLS = COLUMNS * ROWS;

const OCCUPIED_RADIUS = GRID.stepX * 0.5;

const cellAt = (index: number): CanvasPosition => ({
  x: GRID.startX + (index % COLUMNS) * GRID.stepX,
  y: GRID.startY + Math.floor(index / COLUMNS) * GRID.stepY,
});

export const nextGridPosition = (
  occupied: readonly CanvasPosition[],
): CanvasPosition => {
  const isFree = (candidate: CanvasPosition) =>
    !occupied.some(
      (node) =>
        Math.hypot(node.x - candidate.x, node.y - candidate.y) <
        OCCUPIED_RADIUS,
    );

  for (let index = 0; index < CELLS; index += 1) {
    const cell = cellAt(index);
    if (isFree(cell)) return cell;
  }

  // Visible grid is full: wrap into it so the position stays on-screen.
  return cellAt(occupied.length % CELLS);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A stored layout value, when what the entity holds is one. */
export const readCanvasPosition = (
  value: unknown,
): CanvasPosition | undefined => {
  if (!isRecord(value)) return undefined;
  const { x, y } = value;
  if (typeof x !== 'number' || typeof y !== 'number') return undefined;
  return { x, y };
};
