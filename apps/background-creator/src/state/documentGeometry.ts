import {
  type SvgElement,
  TEXT_SIZE_PRESETS,
  type TextElement,
  type Vec,
} from '~/model/types';

import { assertNever } from './assertNever';
import { measureWidestLinePx, textCanvasFont } from './textMeasure';

// Document-space geometry shared by the editor store (drag-clamping, selection
// framing) and the canvas overlay (outline + handle placement). Kept in
// `state/` so the store never has to import from `canvas/`; the canvas depends
// on the store already, so this direction stays acyclic. Everything here is a
// pure function of its arguments except measured text bounds, which read a
// lazily-created offscreen canvas (see textMeasure) — store-side callers pass
// no stage box and stay on the DOM-free approximation.

export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

// Live stage dimensions in device pixels. Passed in from the canvas so the
// Shift-constrain maths (visual squares/circles, 45° lines) stays a pure
// function of its arguments and the store never reads the DOM.
export type StageBox = { width: number; height: number };

export const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

const clampRange = (n: number, lo: number, hi: number): number =>
  n < lo ? lo : n > hi ? hi : n;

// Two normalized points are "the same vertex" below this separation (~sub-pixel
// on any realistic stage). Shared by the polygon close path and the vertex
// resize guard so both agree on what counts as a distinct vertex.
const VERTEX_EPSILON = 1e-4;

export const nearlyEqual = (a: Vec, b: Vec): boolean =>
  Math.abs(a.x - b.x) < VERTEX_EPSILON && Math.abs(a.y - b.y) < VERTEX_EPSILON;

// The number of vertices that are not near-duplicates of an earlier one. A
// polygon needs at least three to enclose a non-zero area.
function distinctVertexCount(points: Vec[]): number {
  const kept: Vec[] = [];
  for (const point of points) {
    if (!kept.some((other) => nearlyEqual(other, point))) kept.push(point);
  }
  return kept.length;
}

// Below this shoelace area (normalized units²) a polygon encloses no usable
// space — its vertices are effectively collinear. Deliberately generous: even a
// tiny intentional triangle sits far above it, while a degenerate one (three
// distinct but collinear points) has an area of ~0.
const MIN_POLYGON_AREA = 1e-6;

// Shoelace area of a polygon in normalized units².
function polygonArea(points: Vec[]): number {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (!a || !b) continue;
    sum += b.x * a.y - a.x * b.y;
  }
  return Math.abs(sum) / 2;
}

// A polygon is degenerate — unusable as a zone — when it has fewer than three
// distinct vertices OR encloses no meaningful area (all vertices collinear).
// distinctVertexCount alone misses the collinear case: a triangle resized (or
// drawn) so one vertex lands on the line between the other two keeps three
// distinct points yet has zero area, and such a zone would export but classify
// no node. The draw-close path and the vertex-resize guard both gate on this.
export function isDegeneratePolygon(points: Vec[]): boolean {
  return (
    distinctVertexCount(points) < 3 || polygonArea(points) < MIN_POLYGON_AREA
  );
}

// Line height applied by the serialized SVG's tspan advance (1.2em), the
// inline editor, and the measured text bounds — keep in sync with
// svg/serialize.ts.
export const TEXT_LINE_HEIGHT_EM = 1.2;

// The rendered font size of a text element on the given stage: the SVG's
// `clamp(min, <vmin>vmin, max)` resolved against the stage box (vmin = 1% of
// the smaller stage dimension), so bounds and the in-place editor match what
// the preview img paints.
export function textFontPx(
  text: Pick<TextElement, 'fontSize'>,
  stage: StageBox,
): number {
  const { minPx, vmin, maxPx } = TEXT_SIZE_PRESETS[text.fontSize];
  const scaled = (vmin / 100) * Math.min(stage.width, stage.height);
  return Math.min(Math.max(scaled, minPx), maxPx);
}

// Fallback bounds when the rendered extent cannot be measured — no stage box
// (store-side drag clamping) or no canvas 2D context (jsdom): each line is
// ~0.04 of the canvas tall, and glyphs are ~0.5em wide (em ≈ the per-line
// height). Enough to frame the label and keep it roughly on-canvas —
// deliberately not pixel-accurate.
const TEXT_LINE_HEIGHT = 0.04;
const TEXT_CHAR_WIDTH = 0.5 * TEXT_LINE_HEIGHT;

function centredBounds(x: number, y: number, w: number, h: number): Bounds {
  return {
    minX: x - w / 2,
    maxX: x + w / 2,
    minY: y - h / 2,
    maxY: y + h / 2,
  };
}

function measuredTextBounds(text: TextElement, stage: StageBox): Bounds | null {
  const px = textFontPx(text, stage);
  const widestPx = measureWidestLinePx(
    text.lines,
    textCanvasFont(text.fontWeight, px),
  );
  if (widestPx === null) return null;
  const width = Math.max(widestPx, 1) / stage.width;
  const height =
    (Math.max(text.lines.length, 1) * TEXT_LINE_HEIGHT_EM * px) / stage.height;
  return centredBounds(text.x, text.y, width, height);
}

// Text is always middle-anchored on (x, y), so the bounds centre there. With a
// stage box the rendered extent is measured (longest line width, 1.2em per
// line, at the resolved clamp() font size); otherwise the approximation above.
export function textBounds(text: TextElement, stage?: StageBox | null): Bounds {
  if (stage && stage.width > 0 && stage.height > 0) {
    const measured = measuredTextBounds(text, stage);
    if (measured) return measured;
  }
  const height = Math.max(text.lines.length, 1) * TEXT_LINE_HEIGHT;
  const longest = text.lines.reduce(
    (max, line) => Math.max(max, line.length),
    0,
  );
  const width = Math.max(longest * TEXT_CHAR_WIDTH, TEXT_CHAR_WIDTH);
  return centredBounds(text.x, text.y, width, height);
}

function pointsBounds(points: Vec[]): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, maxX, minY, maxY };
}

export function elementBounds(el: SvgElement, stage?: StageBox | null): Bounds {
  switch (el.kind) {
    case 'rect':
      return {
        minX: el.x,
        maxX: el.x + el.width,
        minY: el.y,
        maxY: el.y + el.height,
      };
    case 'ellipse':
      return {
        minX: el.cx - el.rx,
        maxX: el.cx + el.rx,
        minY: el.cy - el.ry,
        maxY: el.cy + el.ry,
      };
    case 'line':
      return {
        minX: Math.min(el.x1, el.x2),
        maxX: Math.max(el.x1, el.x2),
        minY: Math.min(el.y1, el.y2),
        maxY: Math.max(el.y1, el.y2),
      };
    case 'polygon':
      return pointsBounds(el.points);
    case 'text':
      return textBounds(el, stage);
    default:
      return assertNever(el);
  }
}

export function boundsCentre(bounds: Bounds): Vec {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

// Clamps a requested translation so the shape's bounding box stays inside the
// [0, 1] canvas — the shape sticks at the edge instead of leaving the canvas.
// A shape larger than the canvas on an axis can never fit, which would invert
// the raw [-min, 1-max] range; folding 0 into the range keeps it valid, so an
// oversized shape can only move toward fitting (or hold still) — never teleport
// to a forced position.
function clampAxisDelta(min: number, max: number, delta: number): number {
  const lo = Math.min(-min, 1 - max, 0);
  const hi = Math.max(-min, 1 - max, 0);
  return clampRange(delta, lo, hi);
}

function clampedDelta(bounds: Bounds, dx: number, dy: number): Vec {
  return {
    x: clampAxisDelta(bounds.minX, bounds.maxX, dx),
    y: clampAxisDelta(bounds.minY, bounds.maxY, dy),
  };
}

export function translateElement(
  el: SvgElement,
  dx: number,
  dy: number,
  stage: StageBox | null = null,
): SvgElement {
  // The stage box matters for text: without it the clamp uses the character
  // approximation while hit-testing and the selection chrome use measured
  // bounds, so realistic labels stop far short of the canvas edges.
  const d = clampedDelta(elementBounds(el, stage), dx, dy);
  switch (el.kind) {
    case 'rect':
      return { ...el, x: clamp01(el.x + d.x), y: clamp01(el.y + d.y) };
    case 'ellipse':
      return { ...el, cx: clamp01(el.cx + d.x), cy: clamp01(el.cy + d.y) };
    case 'line':
      return {
        ...el,
        x1: clamp01(el.x1 + d.x),
        y1: clamp01(el.y1 + d.y),
        x2: clamp01(el.x2 + d.x),
        y2: clamp01(el.y2 + d.y),
      };
    case 'polygon':
      return {
        ...el,
        points: el.points.map((p) => ({
          x: clamp01(p.x + d.x),
          y: clamp01(p.y + d.y),
        })),
      };
    case 'text':
      return { ...el, x: clamp01(el.x + d.x), y: clamp01(el.y + d.y) };
    default:
      return assertNever(el);
  }
}

// --- Shift-constrain maths -------------------------------------------------

// Constrains `target` so the box spanned from `origin` reads as a visual square
// (rect) or circle (ellipse) at the current stage aspect: the pixel extents on
// both axes are made equal. The horizontal extent drives the vertical one, per
// the spec's `ry = rx·stageW/stageH`. Clamped back into [0, 1]; at a canvas edge
// the regularity gives to the clamp rather than escaping the canvas.
export function constrainRegular(
  origin: Vec,
  target: Vec,
  stage: StageBox,
): Vec {
  if (stage.width === 0 || stage.height === 0) return target;
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const magnitude = (Math.abs(dx) * stage.width) / stage.height;
  const signedY = (dy < 0 ? -1 : 1) * magnitude;
  return { x: target.x, y: clamp01(origin.y + signedY) };
}

// Snaps the `origin`→`target` vector to the nearest 45° increment in visual
// (pixel) space, so a Shift-drawn line reads as horizontal/vertical/diagonal on
// screen regardless of the stage aspect.
export function constrainLine45(
  origin: Vec,
  target: Vec,
  stage: StageBox,
): Vec {
  if (stage.width === 0 || stage.height === 0) return target;
  const dxPx = (target.x - origin.x) * stage.width;
  const dyPx = (target.y - origin.y) * stage.height;
  const length = Math.hypot(dxPx, dyPx);
  if (length === 0) return target;
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dyPx, dxPx) / step) * step;
  return {
    x: clamp01(origin.x + (Math.cos(angle) * length) / stage.width),
    y: clamp01(origin.y + (Math.sin(angle) * length) / stage.height),
  };
}
