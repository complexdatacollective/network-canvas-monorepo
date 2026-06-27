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
    it('starts top-left (first position has minimum x+y values)', () => {
      const positions = stickerPositions('square', 4);
      const first = positions[0];
      expect(first).toBeDefined();
      // Top-left corner: x < 0.5 and y < 0.5 (in unit space)
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
  });

  describe('circle shape', () => {
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
      // Going clockwise from top-left, next position should be further right
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
  });

  describe('diamond shape', () => {
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
      const positions = stickerPositions('diamond', 6);
      for (const pos of positions) {
        expect(pos.x).toBeGreaterThanOrEqual(0);
        expect(pos.x).toBeLessThanOrEqual(1);
        expect(pos.y).toBeGreaterThanOrEqual(0);
        expect(pos.y).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('shape independence', () => {
    it('produces distinct distributions for square vs circle', () => {
      const square = stickerPositions('square', 4);
      const circle = stickerPositions('circle', 4);
      // They should differ since they follow different perimeter geometries
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
