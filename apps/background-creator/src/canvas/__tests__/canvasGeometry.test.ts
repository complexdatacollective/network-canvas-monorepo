import { describe, expect, it } from 'vitest';

import type {
  BackgroundDocument,
  EllipseElement,
  PolygonElement,
  RectElement,
  SvgElement,
  Vec,
} from '~/model/types';

import { type Handle, hitTestDocument, resizeElement } from '../canvasGeometry';

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
    zoneLabel: null,
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
    zoneLabel: null,
    ...over,
  };
}

function polygon(over: Partial<PolygonElement> = {}): PolygonElement {
  return {
    id: 'p',
    kind: 'polygon',
    points: [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.5, y: 0.8 },
    ],
    fill: '#ffffff',
    fillOpacity: 0.25,
    stroke: null,
    strokeWidth: 3,
    zoneLabel: null,
    ...over,
  };
}

function doc(elements: SvgElement[]): BackgroundDocument {
  return { version: 1, title: '', description: '', elements };
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

describe('hitTestDocument zero-fill interiors', () => {
  const TOL = 0.02;

  it('selects a zero-fill rect from an interior click when nothing else claims the point', () => {
    // Centre of the rect, more than TOL from every edge.
    const el = rect({ fillOpacity: 0 });
    expect(hitTestDocument({ x: 0.2, y: 0.2 }, doc([el]), TOL)).toEqual({
      id: 'r',
    });
  });

  it('selects a zero-fill ellipse from an interior click when nothing else claims the point', () => {
    const el = ellipse({ fillOpacity: 0 });
    expect(hitTestDocument({ x: 0.5, y: 0.5 }, doc([el]), TOL)).toEqual({
      id: 'e',
    });
  });

  it('selects a zero-fill polygon from an interior click when nothing else claims the point', () => {
    const el = polygon({ fillOpacity: 0 });
    expect(hitTestDocument({ x: 0.5, y: 0.4 }, doc([el]), TOL)).toEqual({
      id: 'p',
    });
  });

  it('still misses a click outside every shape', () => {
    const el = rect({ fillOpacity: 0 });
    expect(hitTestDocument({ x: 0.9, y: 0.9 }, doc([el]), TOL)).toBeNull();
  });

  it('a filled element above an invisible shape wins at shared interior points', () => {
    const invisible = rect({
      id: 'zone',
      fillOpacity: 0,
      x: 0.1,
      y: 0.1,
      width: 0.8,
      height: 0.8,
    });
    const filled = rect({
      id: 'filled',
      x: 0.4,
      y: 0.4,
      width: 0.2,
      height: 0.2,
    });
    expect(
      hitTestDocument({ x: 0.5, y: 0.5 }, doc([invisible, filled]), TOL),
    ).toEqual({ id: 'filled' });
  });

  it('a filled element below an invisible shape still wins pass 1 at shared interior points', () => {
    const filled = rect({
      id: 'filled',
      x: 0.4,
      y: 0.4,
      width: 0.2,
      height: 0.2,
    });
    const invisible = rect({
      id: 'zone',
      fillOpacity: 0,
      x: 0.1,
      y: 0.1,
      width: 0.8,
      height: 0.8,
    });
    expect(
      hitTestDocument({ x: 0.5, y: 0.5 }, doc([filled, invisible]), TOL),
    ).toEqual({ id: 'filled' });
  });

  it('selects the topmost interior among nested zero-fill rings', () => {
    const outer = ellipse({ id: 'outer', fillOpacity: 0, rx: 0.4, ry: 0.4 });
    const middle = ellipse({
      id: 'middle',
      fillOpacity: 0,
      rx: 0.25,
      ry: 0.25,
    });
    const inner = ellipse({ id: 'inner', fillOpacity: 0, rx: 0.1, ry: 0.1 });
    // Between the inner and middle boundaries: outside inner, inside middle
    // and outer, near none of the outlines.
    expect(
      hitTestDocument({ x: 0.67, y: 0.5 }, doc([outer, middle, inner]), TOL),
    ).toEqual({ id: 'middle' });
  });
});

describe('shift-constrained resize', () => {
  it('resizes a rect to a visual square at the stage aspect', () => {
    // Anchor is the fixed SE corner at (0.3, 0.3). On a 200×100 stage (aspect 2)
    // a visual square has width·200 == height·100; the constraint derives the
    // vertical extent from the horizontal drag so the corner stays on-canvas.
    const el = rect({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
    const out = resizeElement(
      el,
      NW,
      { x: 0.2, y: 0 },
      { width: 200, height: 100 },
    );
    if (out.kind === 'rect') {
      expect(out.width * 200).toBeCloseTo(out.height * 100);
    }
  });

  it('resizes an ellipse to a visual circle at the stage aspect', () => {
    const el = ellipse({ cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.2 });
    // Anchor is the fixed NW corner at (0.3, 0.3); the radii scale to equal
    // pixel extents on the wide stage.
    const out = resizeElement(
      el,
      { kind: 'corner', corner: 'se' },
      { x: 0.5, y: 1 },
      { width: 200, height: 100 },
    );
    if (out.kind === 'ellipse') {
      expect(out.rx * 200).toBeCloseTo(out.ry * 100);
    }
  });
});
