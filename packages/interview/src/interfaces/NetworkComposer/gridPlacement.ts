type Position = { x: number; y: number };

// Normalised-canvas grid for placing newly added nodes. Reading order from the
// top-left, wrapping into rows. Kept clear of the vertical tool palette (left
// edge) and the attribute drawer (right edge) so fresh nodes land in view.
const GRID = {
  startX: 0.12,
  startY: 0.12,
  stepX: 0.1,
  stepY: 0.12,
  endX: 0.8,
} as const;

const COLUMNS = Math.max(
  1,
  Math.floor((GRID.endX - GRID.startX) / GRID.stepX) + 1,
);

// A cell counts as occupied when a node already sits within half a step of it,
// so deleting nodes frees their cells for reuse rather than stacking new ones.
const OCCUPIED_RADIUS = GRID.stepX * 0.5;

/**
 * The next free grid cell for a new node, scanning the grid in reading order
 * and skipping cells already occupied by an existing node. Falls back to the
 * computed cell once the grid is densely packed.
 */
export function nextGridPosition(occupied: Position[]): Position {
  const isFree = (candidate: Position) =>
    !occupied.some(
      (node) =>
        Math.hypot(node.x - candidate.x, node.y - candidate.y) <
        OCCUPIED_RADIUS,
    );

  for (let index = 0; ; index++) {
    const cell = {
      x: GRID.startX + (index % COLUMNS) * GRID.stepX,
      y: GRID.startY + Math.floor(index / COLUMNS) * GRID.stepY,
    };
    // Stop scanning once the grid is saturated to avoid an unbounded loop.
    if (isFree(cell) || index >= COLUMNS * 50) return cell;
  }
}
