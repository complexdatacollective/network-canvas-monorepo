import { describe, expect, it } from 'vitest';

import type { EllipseElement, RectElement, Vec, Zone } from '~/model/types';

import { type Handle, resizeElement, resizeZone } from '../canvasGeometry';

const MIN_SIZE = 0.01;
const NW: Handle = { kind: 'corner', corner: 'nw' };

function rect(over: Partial<RectElement> = {}): RectElement {
  return {
    id: 'r',
    kind: 'rect',
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.2,
    fill: '#ffffff',
    fillOpacity: 0.25,
    stroke: null,
    strokeWidth: 3,
    ...over,
  };
}

function ellipse(over: Partial<EllipseElement> = {}): EllipseElement {
  return {
    id: 'e',
    kind: 'ellipse',
    cx: 0.5,
    cy: 0.5,
    rx: 0.25,
    ry: 0.25,
    fill: '#ffffff',
    fillOpacity: 0.25,
    stroke: null,
    strokeWidth: 3,
    ...over,
  };
}

function withinCanvas(r: {
  x: number;
  y: number;
  width: number;
  height: number;
}): void {
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.y).toBeGreaterThanOrEqual(0);
  expect(r.width).toBeGreaterThanOrEqual(MIN_SIZE);
  expect(r.height).toBeGreaterThanOrEqual(MIN_SIZE);
  expect(r.x + r.width).toBeLessThanOrEqual(1 + 1e-9);
  expect(r.y + r.height).toBeLessThanOrEqual(1 + 1e-9);
}

describe('resizedRect via resizeElement', () => {
  it('keeps every field in [0,1] when resizing a rect whose box extends past the canvas', () => {
    // Legal document: x + width = 1.4 (> 1). Resizing must not persist width > 1
    // or the schema rejects it on reopen.
    const el = rect({ x: 0.6, y: 0.1, width: 0.8, height: 0.2 });
    const moving: Vec = { x: 0.1, y: 0.05 };
    const out = resizeElement(el, NW, moving);
    expect(out.kind).toBe('rect');
    if (out.kind === 'rect') {
      withinCanvas(out);
      expect(out.width).toBeLessThanOrEqual(1);
      expect(out.width).toBeCloseTo(0.9);
    }
  });

  it('keeps a MIN_SIZE box when an edge-anchored corner is cross-dragged past the edge', () => {
    // Anchor (opposite SE corner) sits exactly on x=1/y=1; the drag crosses it.
    const el = rect({ x: 0.5, y: 0.5, width: 0.5, height: 0.5 });
    const out = resizeElement(el, NW, { x: 1.5, y: 1.5 });
    if (out.kind === 'rect') {
      withinCanvas(out);
      expect(out.width).toBeCloseTo(MIN_SIZE);
      expect(out.height).toBeCloseTo(MIN_SIZE);
    }
  });

  it('keeps a positive radius when an edge-anchored ellipse corner is cross-dragged past the edge', () => {
    const el = ellipse({ cx: 0.75, cy: 0.75, rx: 0.25, ry: 0.25 });
    const out = resizeElement(el, NW, { x: 1.5, y: 1.5 });
    if (out.kind === 'ellipse') {
      expect(out.rx).toBeGreaterThan(0);
      expect(out.ry).toBeGreaterThan(0);
      expect(out.rx).toBeCloseTo(MIN_SIZE / 2);
      expect(out.cx - out.rx).toBeGreaterThanOrEqual(0);
      expect(out.cx + out.rx).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe('resizedRect via resizeZone', () => {
  it('keeps an out-of-canvas rect zone within [0,1] on resize', () => {
    const zone: Zone = {
      id: 'z',
      label: 'zone-1',
      shape: 'rect',
      x: 0.6,
      y: 0.1,
      width: 0.8,
      height: 0.2,
    };
    const out = resizeZone(zone, NW, { x: 0.1, y: 0.05 });
    if (out.shape === 'rect') {
      withinCanvas(out);
      expect(out.width).toBeLessThanOrEqual(1);
    }
  });
});
