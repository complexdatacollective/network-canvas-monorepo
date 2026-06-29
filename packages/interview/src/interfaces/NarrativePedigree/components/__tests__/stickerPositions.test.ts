import { describe, expect, it } from 'vitest';

import type { NodeShape } from '@codaco/fresco-ui/Node';

import { stickerPositions } from '../stickerPositions';

const SHAPES: NodeShape[] = ['circle', 'square', 'diamond'];

/** Distance of a position from the node centre (0.5, 0.5). */
function radius(p: { x: number; y: number }): number {
  return Math.hypot(p.x - 0.5, p.y - 0.5);
}

/** A position's mirror across the vertical axis. */
function mirror(p: { x: number; y: number }): { x: number; y: number } {
  return { x: 1 - p.x, y: p.y };
}

function approxEqual(
  a: { x: number; y: number },
  b: { x: number; y: number },
  eps = 1e-9,
): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
}

describe('stickerPositions', () => {
  describe('count', () => {
    it.each(SHAPES)('returns exactly count positions (%s)', (shape) => {
      expect(stickerPositions(shape, 4)).toHaveLength(4);
      expect(stickerPositions(shape, 1)).toHaveLength(1);
      expect(stickerPositions(shape, 7)).toHaveLength(7);
    });

    it('returns empty array for count 0 and negatives', () => {
      expect(stickerPositions('square', 0)).toHaveLength(0);
      expect(stickerPositions('circle', -1)).toHaveLength(0);
    });
  });

  describe('deterministic', () => {
    it.each(SHAPES)(
      'returns identical positions across calls (%s)',
      (shape) => {
        expect(stickerPositions(shape, 5)).toEqual(stickerPositions(shape, 5));
      },
    );
  });

  describe('symmetric about the vertical axis', () => {
    // Every position has a mirror (1-x, y) in the set, for every count 1..8.
    it.each(SHAPES)('%s: each position has a vertical mirror', (shape) => {
      for (let count = 1; count <= 8; count++) {
        const positions = stickerPositions(shape, count);
        for (const p of positions) {
          const m = mirror(p);
          const found = positions.some((q) => approxEqual(q, m, 1e-6));
          expect(
            found,
            `count=${count}: no mirror for (${p.x.toFixed(3)},${p.y.toFixed(
              3,
            )})`,
          ).toBe(true);
        }
      }
    });
  });

  describe('placement varies by node shape', () => {
    it('square, circle, and diamond differ for the same count', () => {
      const square = stickerPositions('square', 4);
      const circle = stickerPositions('circle', 4);
      const diamond = stickerPositions('diamond', 4);
      expect(square).not.toEqual(circle);
      expect(diamond).not.toEqual(circle);
      expect(diamond).not.toEqual(square);
    });

    it('a square reaches further toward its corners than a circle', () => {
      // count 4 places markers at the four corner directions (±45°). On a square
      // those land out toward the corners (radius > 0.5); on a circle they stay
      // on the radius-0.5 ring.
      const squareMax = Math.max(...stickerPositions('square', 4).map(radius));
      const circleMax = Math.max(...stickerPositions('circle', 4).map(radius));
      expect(squareMax).toBeGreaterThan(circleMax + 0.05);
      // The circle's markers are all exactly on the 0.5 ring.
      for (const p of stickerPositions('circle', 4)) {
        expect(radius(p)).toBeCloseTo(0.5, 10);
      }
    });

    it("a diamond's tips poke past the bounding box", () => {
      // count 1 is the bottom (a diamond tip): it extends just past y = 1.
      const [tip] = stickerPositions('diamond', 1);
      expect(tip).toBeDefined();
      expect(tip!.y).toBeGreaterThan(1);
      // The square's bottom edge sits exactly on the box.
      const [squareBottom] = stickerPositions('square', 1);
      expect(squareBottom!.y).toBeCloseTo(1, 10);
    });
  });

  describe('consistent gap (markers sit at equal radius per side family)', () => {
    // All four corner markers (count 4) share one radius; all four cardinal
    // markers (the extra slots at count 8) share another. Equal radii at the
    // symmetric anchor directions is what makes the visible gap uniform.
    it.each(SHAPES)('%s: the four corner markers share a radius', (shape) => {
      const corners = stickerPositions(shape, 4).map(radius);
      const first = corners[0]!;
      for (const r of corners) expect(r).toBeCloseTo(first, 10);
    });
  });

  it('accepts all three NodeShape values', () => {
    for (const shape of SHAPES) {
      expect(() => stickerPositions(shape, 3)).not.toThrow();
    }
  });
});
