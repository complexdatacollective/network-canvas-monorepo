type Position = { x: number; y: number };

// Normalised-canvas grid for placing newly added nodes. Reading order from the
// top-left, wrapping into rows. Kept clear of the vertical tool palette (left
// edge) and the attribute drawer (right edge) so fresh nodes land in view.
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

// A cell counts as occupied when a node already sits within half a step of it,
// so deleting nodes frees their cells for reuse rather than stacking new ones.
const OCCUPIED_RADIUS = GRID.stepX * 0.5;

/**
 * The next free grid cell for a new node, scanning the visible grid in reading
 * order and skipping cells already occupied by an existing node. When every
 * visible cell is occupied, wraps back into the grid so the returned position
 * always stays on-screen.
 */
export function nextGridPosition(occupied: Position[]): Position {
  const isFree = (candidate: Position) =>
    !occupied.some(
      (node) =>
        Math.hypot(node.x - candidate.x, node.y - candidate.y) <
        OCCUPIED_RADIUS,
    );

  const cellAt = (index: number) => ({
    x: GRID.startX + (index % COLUMNS) * GRID.stepX,
    y: GRID.startY + Math.floor(index / COLUMNS) * GRID.stepY,
  });

  for (let index = 0; index < CELLS; index++) {
    const cell = cellAt(index);
    if (isFree(cell)) return cell;
  }

  // Visible grid is full: wrap into it so the position stays on-screen.
  return cellAt(occupied.length % CELLS);
}
