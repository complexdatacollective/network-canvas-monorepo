import type {
  BackgroundDocument,
  EllipseElement,
  LineElement,
  RectElement,
  TextElement,
} from '~/model/types';

function makeSoftRect(
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  zoneLabel: string | null,
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
    zoneLabel,
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
    stroke: 'text',
    strokeWidth: 3,
    startArrow: true,
    endArrow: true,
  };
}

function makeLabel(props: {
  x: number;
  y: number;
  lines: string[];
}): TextElement {
  return {
    id: crypto.randomUUID(),
    kind: 'text',
    x: props.x,
    y: props.y,
    lines: props.lines,
    fill: 'text',
    fontSize: 'medium',
    fontWeight: 600,
    opacity: 1,
  };
}

// A stroke-only ring that is both the visible artwork and its own zone. Radii
// are normalized to the stage, so a round circle needs rx scaled by the stage's
// height/width ratio; we target the 16:10 ratio of default macOS displays
// (rx = r * 10/16, verifiable in-app via the 16:10 preview preset) and the
// ring warps on other ratios like any ellipse. The model has no `fill: 'none'`,
// so a fully transparent fill (fillOpacity 0) gives the same visual result.
function makeRing(r: number, zoneLabel: string): EllipseElement {
  return {
    id: crypto.randomUUID(),
    kind: 'ellipse',
    cx: 0.5,
    cy: 0.5,
    rx: r * 0.625,
    ry: r,
    fill: '#ffffff',
    fillOpacity: 0,
    stroke: '#ffffff',
    strokeWidth: 2,
    zoneLabel,
  };
}

export function createBlankDocument(): BackgroundDocument {
  return {
    version: 1,
    title: 'Untitled background',
    description: 'A responsive Network Canvas background.',
    elements: [],
  };
}

export function createQuadrantsTemplate(): BackgroundDocument {
  return {
    version: 1,
    title: 'Quadrants background',
    description:
      'Two crossed axes divide the canvas into four labelled quadrant regions.',
    elements: [
      makeSoftRect(0, 0, 0.5, 0.5, '#ef4444', 'top-left'),
      makeSoftRect(0.5, 0, 0.5, 0.5, '#3b82f6', 'top-right'),
      makeSoftRect(0, 0.5, 0.5, 0.5, '#22c55e', 'bottom-left'),
      makeSoftRect(0.5, 0.5, 0.5, 0.5, '#a855f7', 'bottom-right'),
      makeAxisLine(0, 0.5, 1, 0.5),
      makeAxisLine(0.5, 0, 0.5, 1),
      // Text is always middle-anchored, so the axis-end labels sit far enough
      // in from the canvas edges that their centred extent stays on-canvas.
      makeLabel({ x: 0.06, y: 0.5, lines: ['Low X'] }),
      makeLabel({ x: 0.94, y: 0.5, lines: ['High X'] }),
      makeLabel({ x: 0.5, y: 0.04, lines: ['Low Y'] }),
      makeLabel({ x: 0.5, y: 0.98, lines: ['High Y'] }),
      makeLabel({ x: 0.25, y: 0.25, lines: ['Upper', 'left'] }),
      makeLabel({ x: 0.75, y: 0.25, lines: ['Upper', 'right'] }),
      makeLabel({ x: 0.25, y: 0.75, lines: ['Lower', 'left'] }),
      makeLabel({ x: 0.75, y: 0.75, lines: ['Lower', 'right'] }),
    ],
  };
}

// Faithful model of the sample protocol's responsive political-compass asset
// (packages/protocols/sample/assets/2946e670-3e45-11eb-ac1c-7b8de3fada93.svg).
// The five solid fills are the zones; the 0.21–0.23 visual gutter between the
// unsure band and the quadrants is honestly unassigned. Used as the document the
// editor opens with.
export function createPoliticalCompassDocument(): BackgroundDocument {
  const ink = '#17142f';

  const solidRect = (
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    zoneLabel: string | null,
  ): RectElement => ({
    id: crypto.randomUUID(),
    kind: 'rect',
    x,
    y,
    width,
    height,
    fill,
    fillOpacity: 1,
    stroke: null,
    strokeWidth: 1,
    zoneLabel,
  });

  const axis = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): LineElement => ({
    id: crypto.randomUUID(),
    kind: 'line',
    x1,
    y1,
    x2,
    y2,
    stroke: ink,
    strokeWidth: 3,
    startArrow: true,
    endArrow: true,
  });

  const quadrantLabel = (
    x: number,
    y: number,
    lines: string[],
  ): TextElement => ({
    id: crypto.randomUUID(),
    kind: 'text',
    x,
    y,
    lines,
    fill: '#322f45',
    fontSize: 'medium',
    fontWeight: 500,
    opacity: 0.38,
  });

  return {
    version: 1,
    title: 'Responsive political compass',
    description:
      'An unsure area and four political compass quadrants divided by economic and social axes.',
    elements: [
      solidRect(0, 0, 0.21, 1, '#f1f5f6', 'unsure'),
      solidRect(0.23, 0, 0.385, 0.5, '#ffafb3', 'authoritarian-left'),
      solidRect(0.615, 0, 0.385, 0.5, '#71cef0', 'authoritarian-right'),
      solidRect(0.23, 0.5, 0.385, 0.5, '#bee7b5', 'libertarian-left'),
      solidRect(0.615, 0.5, 0.385, 0.5, '#e5c0df', 'libertarian-right'),
      axis(0.23, 0.5, 1, 0.5),
      axis(0.615, 0, 0.615, 1),
      {
        id: crypto.randomUUID(),
        kind: 'text',
        x: 0.105,
        y: 0.06,
        lines: ['Unsure'],
        fill: '#111111',
        fontSize: 'medium',
        fontWeight: 700,
        opacity: 1,
      },
      quadrantLabel(0.4225, 0.25, ['Authoritarian', 'Left']),
      quadrantLabel(0.8075, 0.25, ['Authoritarian', 'Right']),
      quadrantLabel(0.4225, 0.75, ['Libertarian', 'Left']),
      quadrantLabel(0.8075, 0.75, ['Libertarian', 'Right']),
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
      makeRing(0.45, 'outer'),
      makeRing(0.3, 'middle'),
      makeRing(0.15, 'inner'),
      makeLabel({ x: 0.5, y: 0.5, lines: ['Inner'] }),
      makeLabel({ x: 0.5, y: 0.66, lines: ['Middle'] }),
      makeLabel({ x: 0.5, y: 0.82, lines: ['Outer'] }),
    ],
  };
}
