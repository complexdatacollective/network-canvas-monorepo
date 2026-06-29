import { describe, expect, it } from 'vitest';

import { nextGridPosition } from '../gridPlacement';

describe('nextGridPosition', () => {
  it('places the first node at the top-left cell', () => {
    expect(nextGridPosition([])).toEqual({ x: 0.12, y: 0.12 });
  });

  it('advances along the row as cells fill', () => {
    const first = nextGridPosition([]);
    expect(nextGridPosition([first])).toEqual({ x: 0.22, y: 0.12 });
    expect(nextGridPosition([first, { x: 0.22, y: 0.12 }])).toEqual({
      x: 0.32,
      y: 0.12,
    });
  });

  it('wraps to the next row once the first row is full', () => {
    // Seven columns per row (0.12 → 0.72 in 0.1 steps).
    const firstRow = Array.from({ length: 7 }, (_, i) => ({
      x: 0.12 + i * 0.1,
      y: 0.12,
    }));
    expect(nextGridPosition(firstRow)).toEqual({ x: 0.12, y: 0.3 });
  });

  it('reuses a freed cell rather than stacking past occupied ones', () => {
    // First cell free, second occupied → the first cell is chosen.
    expect(nextGridPosition([{ x: 0.22, y: 0.12 }])).toEqual({
      x: 0.12,
      y: 0.12,
    });
  });

  it('ignores nodes that sit far from any grid cell', () => {
    expect(nextGridPosition([{ x: 0.95, y: 0.95 }])).toEqual({
      x: 0.12,
      y: 0.12,
    });
  });
});
