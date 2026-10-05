export type Direction = 'up' | 'down' | 'left' | 'right';

export type Point = { x: number; y: number };

export const ARROW_DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/**
 * The candidate nearest to `from` in `direction`, for arrow-key movement
 * around the family tree.
 *
 * Only candidates lying in that direction (within a 45° cone either side of
 * it) are considered; among them, distance along the direction counts, and
 * sideways drift counts double, so moving down from a parent prefers the child
 * beneath them over one further across. Returns undefined when nobody lies
 * that way.
 */
export function nearestInDirection<T extends string>(
  from: Point,
  candidates: ReadonlyMap<T, Point>,
  direction: Direction,
): T | undefined {
  let best: { id: T; score: number } | undefined;

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
    const across = direction === 'left' || direction === 'right' ? dy : dx;

    if (along <= 0 || Math.abs(across) > along) continue;

    const score = along + 2 * Math.abs(across);
    if (!best || score < best.score) best = { id, score };
  }

  return best?.id;
}
