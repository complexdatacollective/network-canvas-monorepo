import type {
  BackgroundDocument,
  EllipseElement,
  LineElement,
  RectElement,
  TextElement,
  Zone,
} from '~/model/types';

function makeSoftRect(
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
): RectElement {
  return {
    id: crypto.randomUUID(),
    kind: 'rect',
    x,
    y,
    width,
    height,
    fill,
    fillOpacity: 0.25,
    stroke: null,
    strokeWidth: 1,
  };
}

function makeAxisLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): LineElement {
  return {
    id: crypto.randomUUID(),
    kind: 'line',
    x1,
    y1,
    x2,
    y2,
    stroke: '#ffffff',
    strokeWidth: 3,
    startArrow: true,
    endArrow: true,
  };
}

function makeLabel(props: {
  x: number;
  y: number;
  lines: string[];
  anchor: TextElement['anchor'];
}): TextElement {
  return {
    id: crypto.randomUUID(),
    kind: 'text',
    x: props.x,
    y: props.y,
    lines: props.lines,
    fill: '#ffffff',
    fontMinPx: 14,
    fontVmin: 2.6,
    fontMaxPx: 32,
    fontWeight: 600,
    anchor: props.anchor,
    opacity: 1,
  };
}

function makeRing(r: number): EllipseElement {
  // Stroke-only ring: the model has no `fill: 'none'`, so a fully transparent
  // fill (fillOpacity 0) gives the same visual result.
  return {
    id: crypto.randomUUID(),
    kind: 'ellipse',
    cx: 0.5,
    cy: 0.5,
    rx: r,
    ry: r,
    fill: '#ffffff',
    fillOpacity: 0,
    stroke: '#ffffff',
    strokeWidth: 2,
  };
}

function makeRectZone(
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Zone {
  return { id: crypto.randomUUID(), label, shape: 'rect', x, y, width, height };
}

function makeCircleZone(label: string, r: number): Zone {
  return {
    id: crypto.randomUUID(),
    label,
    shape: 'circle',
    cx: 0.5,
    cy: 0.5,
    r,
  };
}

export function createBlankDocument(): BackgroundDocument {
  return {
    version: 1,
    title: 'Untitled background',
    description: 'A responsive Network Canvas background.',
    elements: [],
    zones: [],
  };
}

export function createQuadrantsTemplate(): BackgroundDocument {
  return {
    version: 1,
    title: 'Quadrants background',
    description:
      'Two crossed axes divide the canvas into four labelled quadrant regions.',
    elements: [
      makeSoftRect(0, 0, 0.5, 0.5, '#ef4444'),
      makeSoftRect(0.5, 0, 0.5, 0.5, '#3b82f6'),
      makeSoftRect(0, 0.5, 0.5, 0.5, '#22c55e'),
      makeSoftRect(0.5, 0.5, 0.5, 0.5, '#a855f7'),
      makeAxisLine(0, 0.5, 1, 0.5),
      makeAxisLine(0.5, 0, 0.5, 1),
      makeLabel({ x: 0.015, y: 0.5, lines: ['Low X'], anchor: 'start' }),
      makeLabel({ x: 0.985, y: 0.5, lines: ['High X'], anchor: 'end' }),
      makeLabel({ x: 0.5, y: 0.04, lines: ['Low Y'], anchor: 'middle' }),
      makeLabel({ x: 0.5, y: 0.98, lines: ['High Y'], anchor: 'middle' }),
      makeLabel({
        x: 0.25,
        y: 0.25,
        lines: ['Upper', 'left'],
        anchor: 'middle',
      }),
      makeLabel({
        x: 0.75,
        y: 0.25,
        lines: ['Upper', 'right'],
        anchor: 'middle',
      }),
      makeLabel({
        x: 0.25,
        y: 0.75,
        lines: ['Lower', 'left'],
        anchor: 'middle',
      }),
      makeLabel({
        x: 0.75,
        y: 0.75,
        lines: ['Lower', 'right'],
        anchor: 'middle',
      }),
    ],
    zones: [
      makeRectZone('top-left', 0, 0, 0.5, 0.5),
      makeRectZone('top-right', 0.5, 0, 0.5, 0.5),
      makeRectZone('bottom-left', 0, 0.5, 0.5, 0.5),
      makeRectZone('bottom-right', 0.5, 0.5, 0.5, 0.5),
    ],
  };
}

export function createConcentricCirclesTemplate(): BackgroundDocument {
  return {
    version: 1,
    title: 'Concentric circles background',
    description:
      'Three nested rings classify positions by distance from the centre.',
    elements: [
      makeRing(0.45),
      makeRing(0.3),
      makeRing(0.15),
      makeLabel({ x: 0.5, y: 0.5, lines: ['Inner'], anchor: 'middle' }),
      makeLabel({ x: 0.5, y: 0.66, lines: ['Middle'], anchor: 'middle' }),
      makeLabel({ x: 0.5, y: 0.82, lines: ['Outer'], anchor: 'middle' }),
    ],
    zones: [
      makeCircleZone('inner', 0.15),
      makeCircleZone('middle', 0.3),
      makeCircleZone('outer', 0.45),
    ],
  };
}
