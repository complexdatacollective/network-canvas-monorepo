export type Vec = { x: number; y: number };

type BaseElement = { id: string };

// rect/ellipse/polygon can be marked as zones; the label becomes the exported
// variable value. null = not a zone.
export type RectElement = BaseElement & {
  kind: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  fillOpacity: number; // 0..1
  stroke: string | null;
  strokeWidth: number; // px, non-scaling
  zoneLabel: string | null;
};

export type EllipseElement = BaseElement & {
  kind: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fill: string;
  fillOpacity: number;
  stroke: string | null;
  strokeWidth: number;
  zoneLabel: string | null;
};

export type LineElement = BaseElement & {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
  startArrow: boolean;
  endArrow: boolean;
};

export type PolygonElement = BaseElement & {
  kind: 'polygon';
  points: Vec[]; // ≥ 3
  fill: string;
  fillOpacity: number;
  stroke: string | null;
  strokeWidth: number;
  zoneLabel: string | null;
};

export type TextElement = BaseElement & {
  kind: 'text';
  x: number;
  y: number;
  lines: string[]; // ≥ 1, one <tspan> per line
  fill: string;
  fontMinPx: number;
  fontVmin: number;
  fontMaxPx: number; // clamp() parts
  fontWeight: 400 | 500 | 600 | 700;
  anchor: 'start' | 'middle' | 'end';
  opacity: number; // 0..1
};

export type SvgElement =
  | RectElement
  | EllipseElement
  | LineElement
  | PolygonElement
  | TextElement;

export type ZoneElement = RectElement | EllipseElement | PolygonElement;

export type BackgroundDocument = {
  version: 1;
  title: string; // → <title>, a11y
  description: string; // → <desc>, a11y
  elements: SvgElement[]; // paint order = array order; zones = zoneLabel ≠ null
};
