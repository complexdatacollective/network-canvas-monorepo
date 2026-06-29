import { describe, expect, it } from 'vitest';

import {
  collideRadiusForNode,
  EDGE_GAP_RATIO,
  hasUsableDimensions,
  toNormalized,
  toPixels,
} from '../layoutGeometry';

describe('layoutGeometry', () => {
  it('round-trips normalized -> px -> normalized on a non-square canvas', () => {
    const dims = { width: 1600, height: 900 };
    const samples = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0.5, y: 0.5 },
      { x: 0.123, y: 0.876 },
      { x: 0.999, y: 0.001 },
    ];

    for (const norm of samples) {
      const back = toNormalized(toPixels(norm, dims), dims);
      expect(back.x).toBeCloseTo(norm.x, 10);
      expect(back.y).toBeCloseTo(norm.y, 10);
    }
  });

  it('maps x to width and y to height (anisotropic mapping is explicit)', () => {
    const dims = { width: 1600, height: 900 };
    const px = toPixels({ x: 0.5, y: 0.5 }, dims);
    expect(px.x).toBe(800);
    expect(px.y).toBe(450);
  });

  it('collideRadius adds the edge-gap margin so center-to-center clears a channel', () => {
    const radius = 48;
    const collide = collideRadiusForNode(radius);
    // center-to-center minimum is 2 * collide
    const minCenterToCenter = 2 * collide;
    const minEdgeToEdge = minCenterToCenter - 2 * radius;
    expect(collide).toBeCloseTo(radius * (1 + EDGE_GAP_RATIO), 10);
    // Edge-to-edge channel equals EDGE_GAP_RATIO * diameter (= 1.2 * radius).
    expect(minEdgeToEdge).toBeCloseTo(2 * EDGE_GAP_RATIO * radius, 10);
    expect(minEdgeToEdge).toBeGreaterThan(0);
  });

  it('treats null / zero-size dimensions as unusable', () => {
    expect(hasUsableDimensions(null)).toBe(false);
    expect(hasUsableDimensions({ width: 0, height: 0 })).toBe(false);
    expect(hasUsableDimensions({ width: 100, height: 0 })).toBe(false);
    expect(hasUsableDimensions({ width: 0, height: 100 })).toBe(false);
    expect(hasUsableDimensions({ width: 100, height: 100 })).toBe(true);
  });

  it('toNormalized is defensive against a zero-size canvas', () => {
    expect(toNormalized({ x: 10, y: 20 }, { width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
    });
  });
});
