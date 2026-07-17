import type { SvgElement, TextElement, Vec } from '~/model/types';

import { assertNever } from './assertNever';

// Pure document-space geometry shared by the editor store (drag-clamping,
// selection framing) and the canvas overlay (outline + handle placement). Kept
// in `state/` so the store never has to import from `canvas/`; the canvas
// depends on the store already, so this direction stays acyclic.

export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

// Live stage dimensions in device pixels. Passed in from the canvas so the
// Shift-constrain maths (visual squares/circles, 45° lines) stays a pure
// function of its arguments and the store never reads the DOM.
export type StageBox = { width: number; height: number };

export const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

const clampRange = (n: number, lo: number, hi: number): number =>
  n < lo ? lo : n > hi ? hi : n;

// Text carries no measurable geometry in the document model, so its selection
// box and drag-clamp bounds are approximated: each line is ~0.04 of the canvas
// tall, and glyphs are ~0.5em wide (em ≈ the per-line height). Enough to frame
// the label and keep it roughly on-canvas — deliberately not pixel-accurate.
const TEXT_LINE_HEIGHT = 0.04;
const TEXT_CHAR_WIDTH = 0.5 * TEXT_LINE_HEIGHT;

export function textBounds(text: TextElement): Bounds {
  const height = Math.max(text.lines.length, 1) * TEXT_LINE_HEIGHT;
  const longest = text.lines.reduce(
    (max, line) => Math.max(max, line.length),
    0,
  );
  const width = Math.max(longest * TEXT_CHAR_WIDTH, TEXT_CHAR_WIDTH);
  const top = text.y - height / 2;
  const bottom = text.y + height / 2;
  let left: number;
  let right: number;
  if (text.anchor === 'start') {
    left = text.x;
    right = text.x + width;
  } else if (text.anchor === 'end') {
    left = text.x - width;
    right = text.x;
  } else {
    left = text.x - width / 2;
    right = text.x + width / 2;
  }
  return { minX: left, maxX: right, minY: top, maxY: bottom };
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

export function elementBounds(el: SvgElement): Bounds {
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
      return textBounds(el);
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
): SvgElement {
  const d = clampedDelta(elementBounds(el), dx, dy);
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
