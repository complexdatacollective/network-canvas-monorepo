import { describe, expect, it } from 'vitest';

import {
  canZoomIn,
  canZoomOut,
  centeredScrollLeft,
  clampScroll,
  DEFAULT_ZOOM,
  scaleAroundCenter,
  zoomIn,
  zoomOut,
} from '../zoom';

describe('zoom arithmetic', () => {
  it('starts at 100%', () => {
    expect(DEFAULT_ZOOM).toBe(1);
  });

  it('zooms in by a multiplicative step and clamps at 2x', () => {
    expect(zoomIn(1)).toBeCloseTo(1.25);
    expect(zoomIn(1.953125)).toBe(2); // 1.953125 * 1.25 = 2.44 -> clamped
    expect(zoomIn(2)).toBe(2);
  });

  it('zooms out by a multiplicative step and clamps at 0.5x', () => {
    expect(zoomOut(1)).toBeCloseTo(0.8);
    expect(zoomOut(0.512)).toBe(0.5); // 0.512 / 1.25 = 0.4096 -> clamped
    expect(zoomOut(0.5)).toBe(0.5);
  });

  it('reports whether further zoom is possible', () => {
    expect(canZoomIn(1)).toBe(true);
    expect(canZoomIn(2)).toBe(false);
    expect(canZoomOut(1)).toBe(true);
    expect(canZoomOut(0.5)).toBe(false);
  });

  it('anchors scroll so the viewport centre stays fixed', () => {
    // scroll 0, viewport 100, doubling -> centre (50) maps to 100 -> scroll 50
    expect(scaleAroundCenter(0, 100, 2)).toBe(50);
    // halving keeps 0 at 0's neighbourhood: (0+50)*0.5 - 50 = -25
    expect(scaleAroundCenter(0, 100, 0.5)).toBe(-25);
  });

  it('clamps scroll offsets into range', () => {
    expect(clampScroll(-25, 300, 100)).toBe(0); // below 0
    expect(clampScroll(500, 300, 100)).toBe(200); // above max (300-100)
    expect(clampScroll(120, 300, 100)).toBe(120); // in range
    expect(clampScroll(50, 80, 100)).toBe(0); // content fits: max is 0
  });

  it('centres content wider than the viewport', () => {
    expect(centeredScrollLeft(300, 100)).toBe(100); // (300-100)/2
    expect(centeredScrollLeft(80, 100)).toBe(0); // fits -> 0
  });
});
