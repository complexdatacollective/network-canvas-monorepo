import { describe, expect, it } from 'vitest';

import {
  collideRadiusForNode,
  EDGE_GAP_RATIO,
  fromSim,
  hasUsableDimensions,
  toSim,
} from '../layoutGeometry';

describe('layoutGeometry', () => {
  it('round-trips normalized -> sim -> normalized on a non-square canvas', () => {
    const dims = { width: 1600, height: 900 };
    const samples = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0.5, y: 0.5 },
      { x: 0.123, y: 0.876 },
      { x: 0.999, y: 0.001 },
    ];

    for (const norm of samples) {
      const back = fromSim(toSim(norm, dims), dims);
      expect(back.x).toBeCloseTo(norm.x, 10);
      expect(back.y).toBeCloseTo(norm.y, 10);
    }
  });

  it('maps both axes by the canvas height (isotropic: equal px deltas -> equal sim deltas)', () => {
    const dims = { width: 1600, height: 900 };
    // A normalized x-delta spans the full width (1600px); the same normalized
    // y-delta spans the full height (900px). After toSim, equal PIXEL deltas on
    // each axis must produce equal SIM deltas. dxPx = dxNorm * width; the matching
    // y-delta covering the same pixels is dyNorm = dxPx / height.
    const dxNorm = 0.1;
    const dxPx = dxNorm * dims.width;
    const dyNorm = dxPx / dims.height;

    const aOrigin = toSim({ x: 0.2, y: 0.2 }, dims);
    const aShiftedX = toSim({ x: 0.2 + dxNorm, y: 0.2 }, dims);
    const aShiftedY = toSim({ x: 0.2, y: 0.2 + dyNorm }, dims);

    const simDx = aShiftedX.x - aOrigin.x;
    const simDy = aShiftedY.y - aOrigin.y;
    expect(simDx).toBeCloseTo(simDy, 10);
  });

  it('places sim coordinates in [0, aspect] x [0, 1]', () => {
    const dims = { width: 1600, height: 900 };
    const aspect = dims.width / dims.height;
    expect(toSim({ x: 0, y: 0 }, dims)).toEqual({ x: 0, y: 0 });
    expect(toSim({ x: 1, y: 1 }, dims)).toEqual({ x: aspect, y: 1 });
    expect(toSim({ x: 0.5, y: 0.5 }, dims)).toEqual({ x: aspect / 2, y: 0.5 });
  });

  it('collideRadius adds the edge-gap margin so center-to-center clears a channel', () => {
    const radius = 48;
    const collide = collideRadiusForNode(radius);
    // center-to-center minimum is 2 * collide
    const minCenterToCenter = 2 * collide;
    const minEdgeToEdge = minCenterToCenter - 2 * radius;
    expect(collide).toBeCloseTo(radius * (1 + EDGE_GAP_RATIO), 10);
    // Edge-to-edge channel equals EDGE_GAP_RATIO * diameter (= 0.8 * radius).
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

  it('fromSim is defensive against a zero-size canvas', () => {
    expect(fromSim({ x: 10, y: 20 }, { width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
    });
  });
});
