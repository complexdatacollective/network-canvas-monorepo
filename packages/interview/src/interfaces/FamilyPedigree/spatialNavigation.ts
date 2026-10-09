export type Direction = 'up' | 'down' | 'left' | 'right';

export type Point = { x: number; y: number };

export const ARROW_DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/** Positions closer than this, in layout pixels, count as level. */
const LEVEL = 1;

/**
 * The candidate nearest to `from` in `direction`, for arrow-key movement
 * around the family tree, given positions in layout units (unaffected by the
 * zoom, so the answer is the same at every zoom).
 *
 * Only candidates lying in that direction (within a 45° cone either side of
 * it, its edge included) are considered. Among them, the nearest row wins —
 * the next generation up or down, or the same row across — and then the
 * nearest column; so moving up prefers someone one row up and a column
 * across over someone two rows up, and moving right stays on the row. Of two
 * placed alike, the one on the left (or, moving across, the one above) wins.
 * Returns undefined when nobody lies that way.
 */
export function nearestInDirection<T extends string>(
  from: Point,
  candidates: ReadonlyMap<T, Point>,
  direction: Direction,
): T | undefined {
  const vertical = direction === 'up' || direction === 'down';
  let best: { id: T; rows: number; columns: number; order: number } | undefined;

  for (const [id, point] of candidates) {
    const dx = point.x - from.x;
    const dy = point.y - from.y;
    const along =
      direction === 'right'
        ? dx
        : direction === 'left'
          ? -dx
          : direction === 'down'
            ? dy
            : -dy;
    const across = vertical ? dx : dy;

    if (along < LEVEL || Math.abs(across) > along + LEVEL) continue;

    // How far away in rows and in columns, and where it sits to break a tie.
    const rows = vertical ? along : Math.abs(across);
    const columns = vertical ? Math.abs(across) : along;
    const order = vertical ? point.x : point.y;
    const nearer =
      !best ||
      (Math.abs(rows - best.rows) >= LEVEL
        ? rows < best.rows
        : Math.abs(columns - best.columns) >= LEVEL
          ? columns < best.columns
          : order < best.order);
    if (nearer) best = { id, rows, columns, order };
  }

  return best?.id;
}
