import { describe, expect, it } from 'vitest';

import type { NodeShape } from '@codaco/fresco-ui/Node';

import { stickerPositions } from '../stickerPositions';

describe('stickerPositions', () => {
  describe('count', () => {
    it('returns exactly count positions for square', () => {
      expect(stickerPositions('square', 4)).toHaveLength(4);
    });

    it('returns exactly count positions for circle', () => {
      expect(stickerPositions('circle', 5)).toHaveLength(5);
    });

    it('returns exactly count positions for diamond', () => {
      expect(stickerPositions('diamond', 3)).toHaveLength(3);
    });

    it('returns empty array for count 0', () => {
      expect(stickerPositions('square', 0)).toHaveLength(0);
    });

    it('returns single position for count 1', () => {
      expect(stickerPositions('circle', 1)).toHaveLength(1);
    });
  });

  describe('square shape', () => {
    it('count=4 → exactly the 4 corners in CW order from top-left', () => {
      const positions = stickerPositions('square', 4);
      expect(positions[0]).toEqual({ x: 0, y: 0 }); // top-left
      expect(positions[1]).toEqual({ x: 1, y: 0 }); // top-right
      expect(positions[2]).toEqual({ x: 1, y: 1 }); // bottom-right
      expect(positions[3]).toEqual({ x: 0, y: 1 }); // bottom-left
    });

    it('count=8 → corners first, then edge-midpoints', () => {
      const positions = stickerPositions('square', 8);
      // Corners
      expect(positions[0]).toEqual({ x: 0, y: 0 });
      expect(positions[1]).toEqual({ x: 1, y: 0 });
      expect(positions[2]).toEqual({ x: 1, y: 1 });
      expect(positions[3]).toEqual({ x: 0, y: 1 });
      // Edge midpoints
      expect(positions[4]).toEqual({ x: 0.5, y: 0 });
      expect(positions[5]).toEqual({ x: 1, y: 0.5 });
      expect(positions[6]).toEqual({ x: 0.5, y: 1 });
      expect(positions[7]).toEqual({ x: 0, y: 0.5 });
    });

    it('prefix property: positions(n) is a prefix of positions(8)', () => {
      const full = stickerPositions('square', 8);
      for (let n = 1; n <= 8; n++) {
        const sub = stickerPositions('square', n);
        expect(sub).toEqual(full.slice(0, n));
      }
    });

    it('starts top-left (first position has minimum x+y values)', () => {
      const positions = stickerPositions('square', 4);
      const first = positions[0];
      expect(first).toBeDefined();
      expect(first!.x).toBeLessThan(0.5);
      expect(first!.y).toBeLessThan(0.5);
    });

    it('proceeds clockwise (top-left → top-right → bottom-right → bottom-left)', () => {
      const positions = stickerPositions('square', 4);
      const [topLeft, topRight, bottomRight, bottomLeft] = positions;
      expect(topLeft).toBeDefined();
      expect(topRight).toBeDefined();
      expect(bottomRight).toBeDefined();
      expect(bottomLeft).toBeDefined();

      // Top row: y is small
      expect(topLeft!.y).toBeLessThan(0.5);
      expect(topRight!.y).toBeLessThan(0.5);
      // Bottom row: y is large
      expect(bottomRight!.y).toBeGreaterThanOrEqual(0.5);
      expect(bottomLeft!.y).toBeGreaterThanOrEqual(0.5);
      // Left column: x is small
      expect(topLeft!.x).toBeLessThan(0.5);
      expect(bottomLeft!.x).toBeLessThan(0.5);
      // Right column: x is large
      expect(topRight!.x).toBeGreaterThanOrEqual(0.5);
      expect(bottomRight!.x).toBeGreaterThanOrEqual(0.5);
    });

    it('returns deterministic positions', () => {
      const a = stickerPositions('square', 3);
      const b = stickerPositions('square', 3);
      expect(a).toEqual(b);
    });

    it('all positions are within unit bounds [0,1]', () => {
      const positions = stickerPositions('square', 8);
      for (const pos of positions) {
        expect(pos.x).toBeGreaterThanOrEqual(0);
        expect(pos.x).toBeLessThanOrEqual(1);
        expect(pos.y).toBeGreaterThanOrEqual(0);
        expect(pos.y).toBeLessThanOrEqual(1);
      }
    });

    it('all points lie on the box edges (x or y is 0 or 1)', () => {
      const positions = stickerPositions('square', 8);
      for (const pos of positions) {
        const onEdge =
          Math.abs(pos.x) < 1e-10 ||
          Math.abs(pos.x - 1) < 1e-10 ||
          Math.abs(pos.y) < 1e-10 ||
          Math.abs(pos.y - 1) < 1e-10;
        expect(onEdge).toBe(true);
      }
    });
  });

  describe('circle shape', () => {
    it('count=8 → all 8 points lie on the radius-0.5 ring', () => {
      const positions = stickerPositions('circle', 8);
      expect(positions).toHaveLength(8);
      for (const pos of positions) {
        const dx = pos.x - 0.5;
        const dy = pos.y - 0.5;
        expect(dx * dx + dy * dy).toBeCloseTo(0.25, 10);
      }
    });

    it('starts top-left (first position has x < 0.5 and y < 0.5)', () => {
      const positions = stickerPositions('circle', 4);
      const first = positions[0];
      expect(first).toBeDefined();
      expect(first!.x).toBeLessThan(0.5);
      expect(first!.y).toBeLessThan(0.5);
    });

    it('proceeds clockwise (second position has larger x than first)', () => {
      const positions = stickerPositions('circle', 4);
      const [first, second] = positions;
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      expect(second!.x).toBeGreaterThan(first!.x);
    });

    it('all positions are within unit bounds [0,1]', () => {
      const positions = stickerPositions('circle', 8);
      for (const pos of positions) {
        expect(pos.x).toBeGreaterThanOrEqual(0);
        expect(pos.x).toBeLessThanOrEqual(1);
        expect(pos.y).toBeGreaterThanOrEqual(0);
        expect(pos.y).toBeLessThanOrEqual(1);
      }
    });

    it('returns deterministic positions', () => {
      const a = stickerPositions('circle', 5);
      const b = stickerPositions('circle', 5);
      expect(a).toEqual(b);
    });

    it('all points lie on the inscribed circle: (x-0.5)²+(y-0.5)²≈0.25', () => {
      const positions = stickerPositions('circle', 8);
      for (const pos of positions) {
        const dx = pos.x - 0.5;
        const dy = pos.y - 0.5;
        expect(dx * dx + dy * dy).toBeCloseTo(0.25, 10);
      }
    });
  });

  describe('diamond shape', () => {
    it('count=4 → the 4 face-midpoints on the 0.425 rendered ring', () => {
      const positions = stickerPositions('diamond', 4);
      const R = 0.5 * 0.85; // 0.425
      const half = R / 2; // 0.2125
      expect(positions[0]).toEqual({ x: 0.5 - half, y: 0.5 - half }); // top-left
      expect(positions[1]).toEqual({ x: 0.5 + half, y: 0.5 - half }); // top-right
      expect(positions[2]).toEqual({ x: 0.5 + half, y: 0.5 + half }); // bottom-right
      expect(positions[3]).toEqual({ x: 0.5 - half, y: 0.5 + half }); // bottom-left
      // All on the |x-0.5|+|y-0.5|=R ring
      for (const pos of positions) {
        expect(Math.abs(pos.x - 0.5) + Math.abs(pos.y - 0.5)).toBeCloseTo(
          R,
          10,
        );
      }
    });

    it('count=8 → face-midpoints first, then vertices', () => {
      const positions = stickerPositions('diamond', 8);
      const R = 0.5 * 0.85;
      const half = R / 2;
      // Face midpoints
      expect(positions[0]).toEqual({ x: 0.5 - half, y: 0.5 - half });
      expect(positions[1]).toEqual({ x: 0.5 + half, y: 0.5 - half });
      expect(positions[2]).toEqual({ x: 0.5 + half, y: 0.5 + half });
      expect(positions[3]).toEqual({ x: 0.5 - half, y: 0.5 + half });
      // Vertices
      expect(positions[4]).toEqual({ x: 0.5, y: 0.5 - R });
      expect(positions[5]).toEqual({ x: 0.5 + R, y: 0.5 });
      expect(positions[6]).toEqual({ x: 0.5, y: 0.5 + R });
      expect(positions[7]).toEqual({ x: 0.5 - R, y: 0.5 });
    });

    it('prefix property: positions(n) is a prefix of positions(8)', () => {
      const full = stickerPositions('diamond', 8);
      for (let n = 1; n <= 8; n++) {
        const sub = stickerPositions('diamond', n);
        expect(sub).toEqual(full.slice(0, n));
      }
    });

    it('all count=4 points lie on the |x-0.5|+|y-0.5|≈0.425 ring', () => {
      const R = 0.5 * 0.85;
      const positions = stickerPositions('diamond', 4);
      for (const pos of positions) {
        expect(Math.abs(pos.x - 0.5) + Math.abs(pos.y - 0.5)).toBeCloseTo(
          R,
          10,
        );
      }
    });

    it('starts top-left (first position has x < 0.5 and y < 0.5)', () => {
      const positions = stickerPositions('diamond', 4);
      const first = positions[0];
      expect(first).toBeDefined();
      expect(first!.x).toBeLessThan(0.5);
      expect(first!.y).toBeLessThan(0.5);
    });

    it('returns deterministic positions', () => {
      const a = stickerPositions('diamond', 4);
      const b = stickerPositions('diamond', 4);
      expect(a).toEqual(b);
    });

    it('all positions are within unit bounds [0,1]', () => {
      const positions = stickerPositions('diamond', 8);
      for (const pos of positions) {
        expect(pos.x).toBeGreaterThanOrEqual(0);
        expect(pos.x).toBeLessThanOrEqual(1);
        expect(pos.y).toBeGreaterThanOrEqual(0);
        expect(pos.y).toBeLessThanOrEqual(1);
      }
    });

    it('all count=8 points lie on the |x-0.5|+|y-0.5|≈0.425 ring', () => {
      const R = 0.5 * 0.85;
      const positions = stickerPositions('diamond', 8);
      for (const pos of positions) {
        expect(Math.abs(pos.x - 0.5) + Math.abs(pos.y - 0.5)).toBeCloseTo(
          R,
          10,
        );
      }
    });
  });

  describe('shape independence', () => {
    it('produces distinct distributions for square vs circle', () => {
      const square = stickerPositions('square', 4);
      const circle = stickerPositions('circle', 4);
      expect(square).not.toEqual(circle);
    });
  });

  it('accepts all three NodeShape values', () => {
    const shapes: NodeShape[] = ['square', 'circle', 'diamond'];
    for (const shape of shapes) {
      expect(() => stickerPositions(shape, 3)).not.toThrow();
    }
  });
});
