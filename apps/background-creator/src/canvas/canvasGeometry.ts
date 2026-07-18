import type { BackgroundDocument, SvgElement, Vec } from '~/model/types';
import { assertNever } from '~/state/assertNever';
import {
  type Bounds,
  clamp01,
  constrainRegular,
  elementBounds,
  type StageBox,
  textBounds,
} from '~/state/documentGeometry';
import type { Selection } from '~/state/editorStore';

// Minimum normalized extent for a resized shape, matching the store's draw
// minimum so a drawn and a resized shape can't disagree on "too small".
const MIN_SIZE = 0.01;

const clampRange = (n: number, lo: number, hi: number): number =>
  n < lo ? lo : n > hi ? hi : n;

export type Handle =
  | { kind: 'corner'; corner: 'nw' | 'ne' | 'sw' | 'se' }
  | { kind: 'endpoint'; which: 1 | 2 }
  | { kind: 'vertex'; index: number };

export type HandlePlacement = { handle: Handle; pos: Vec };

// --- membership + distance primitives -------------------------------------

// Ray-casting parity test mirroring geometry/zones.ts pointInPolygon (which is
// itself kept byte-equivalent to the interview ComposerCanvas), so the editor's
// element hit-testing agrees with zone/script membership. A local copy is used
// because geometry/zones only exposes pointInZone (ZoneElement-shaped), and this
// file must not modify geometry/.
function pointInPolygon(p: Vec, points: Vec[]): boolean {
  if (points.length < 3) return false;
  let inside = false;
  const { x, y } = p;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (!a || !b) continue;
    const intersect =
      a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = clampRange(((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function minEdgeDistance(p: Vec, points: Vec[]): number {
  let min = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (!a || !b) continue;
    min = Math.min(min, distToSegment(p, a, b));
  }
  return min;
}

function withinBounds(p: Vec, b: Bounds, tol: number): boolean {
  return (
    p.x >= b.minX - tol &&
    p.x <= b.maxX + tol &&
    p.y >= b.minY - tol &&
    p.y <= b.maxY + tol
  );
}

function nearRectEdge(p: Vec, b: Bounds, tol: number): boolean {
  if (!withinBounds(p, b, tol)) return false;
  const innerFits = b.maxX - b.minX > 2 * tol && b.maxY - b.minY > 2 * tol;
  if (!innerFits) return true;
  const insideInner =
    p.x > b.minX + tol &&
    p.x < b.maxX - tol &&
    p.y > b.minY + tol &&
    p.y < b.maxY - tol;
  return !insideInner;
}

function insideEllipse(
  p: Vec,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): boolean {
  if (rx <= 0 || ry <= 0) return false;
  const nx = (p.x - cx) / rx;
  const ny = (p.y - cy) / ry;
  return nx * nx + ny * ny <= 1;
}

// Approximate radial distance from the point to the ellipse boundary: scale the
// centre→point ray until it reaches the boundary (where the normalized value is
// 1), then compare lengths. Cheap and adequate for a click tolerance; not an
// exact nearest-point-on-ellipse solution.
function nearEllipseEdge(
  p: Vec,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  tol: number,
): boolean {
  if (rx <= 0 || ry <= 0) return false;
  const nx = (p.x - cx) / rx;
  const ny = (p.y - cy) / ry;
  const s = Math.sqrt(nx * nx + ny * ny);
  const d = Math.hypot(p.x - cx, p.y - cy);
  // At the exact centre the ray has no length, so the radial estimate is
  // undefined. The centre is on the outline only for a genuinely degenerate
  // ellipse whose whole extent is within tolerance — not for every large one.
  if (s < 1e-6) return Math.min(rx, ry) <= tol;
  const boundaryDist = d / s;
  return Math.abs(d - boundaryDist) <= tol;
}

// --- element hit tests -----------------------------------------------------

// A zero-fill (invisible) shape is grabbable only near its outline, so a filled
// element sitting over an invisible zone's interior stays selectable.
function hitTestElement(p: Vec, el: SvgElement, tol: number): boolean {
  switch (el.kind) {
    case 'rect': {
      const b = elementBounds(el);
      return el.fillOpacity > 0
        ? withinBounds(p, b, tol)
        : nearRectEdge(p, b, tol);
    }
    case 'ellipse':
      return el.fillOpacity > 0
        ? insideEllipse(p, el.cx, el.cy, el.rx, el.ry)
        : nearEllipseEdge(p, el.cx, el.cy, el.rx, el.ry, tol);
    case 'line':
      return (
        distToSegment(p, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }) <= tol
      );
    case 'polygon':
      if (el.fillOpacity > 0 && pointInPolygon(p, el.points)) return true;
      return minEdgeDistance(p, el.points) <= tol;
    case 'text':
      return withinBounds(p, textBounds(el), tol);
    default:
      return assertNever(el);
  }
}

export function hitTestDocument(
  p: Vec,
  doc: BackgroundDocument,
  tol: number,
): Selection | null {
  // Topmost element wins: iterate paint order back-to-front.
  for (let i = doc.elements.length - 1; i >= 0; i -= 1) {
    const el = doc.elements[i];
    if (el && hitTestElement(p, el, tol)) return { id: el.id };
  }
  return null;
}

// --- handle placement ------------------------------------------------------

function cornerPlacements(b: Bounds): HandlePlacement[] {
  return [
    { handle: { kind: 'corner', corner: 'nw' }, pos: { x: b.minX, y: b.minY } },
    { handle: { kind: 'corner', corner: 'ne' }, pos: { x: b.maxX, y: b.minY } },
    { handle: { kind: 'corner', corner: 'sw' }, pos: { x: b.minX, y: b.maxY } },
    { handle: { kind: 'corner', corner: 'se' }, pos: { x: b.maxX, y: b.maxY } },
  ];
}

export function elementHandles(el: SvgElement): HandlePlacement[] {
  switch (el.kind) {
    case 'rect':
    case 'ellipse':
      return cornerPlacements(elementBounds(el));
    case 'line':
      return [
        { handle: { kind: 'endpoint', which: 1 }, pos: { x: el.x1, y: el.y1 } },
        { handle: { kind: 'endpoint', which: 2 }, pos: { x: el.x2, y: el.y2 } },
      ];
    case 'polygon':
      return el.points.map((pos, index) => ({
        handle: { kind: 'vertex', index },
        pos,
      }));
    case 'text':
      // Text scales via its font clamp, not a drag box, so it exposes no handles.
      return [];
    default:
      return assertNever(el);
  }
}

// --- resize ---------------------------------------------------------------

function oppositeCorner(b: Bounds, corner: 'nw' | 'ne' | 'sw' | 'se'): Vec {
  switch (corner) {
    case 'nw':
      return { x: b.maxX, y: b.maxY };
    case 'ne':
      return { x: b.minX, y: b.maxY };
    case 'sw':
      return { x: b.maxX, y: b.minY };
    case 'se':
      return { x: b.minX, y: b.minY };
    default:
      return assertNever(corner);
  }
}

type Rect = { x: number; y: number; width: number; height: number };

// Grows a collapsed [lo, hi] span to MIN_SIZE while keeping `anchor` as one edge
// and staying inside [0, 1]. Grows away from the anchor toward the drag; if that
// side is against the canvas edge it grows the other way, so a MIN_SIZE box
// always survives even when the anchor sits exactly on the 0/1 boundary.
function ensureMinExtent(
  lo: number,
  hi: number,
  anchor: number,
): [number, number] {
  if (hi - lo >= MIN_SIZE) return [lo, hi];
  if (anchor + MIN_SIZE <= 1) return [anchor, anchor + MIN_SIZE];
  return [anchor - MIN_SIZE, anchor];
}

function resizedRect(anchor: Vec, moving: Vec): Rect {
  // The anchor is the fixed opposite corner. A legal document can place it
  // outside the canvas (e.g. x + width > 1), so clamp it in before sizing —
  // otherwise the result can exceed [0, 1] and be rejected by the schema on
  // reopen, silently losing the shape.
  const ax = clamp01(anchor.x);
  const ay = clamp01(anchor.y);
  const mx = clamp01(moving.x);
  const my = clamp01(moving.y);
  const [x0, x1] = ensureMinExtent(Math.min(ax, mx), Math.max(ax, mx), ax);
  const [y0, y1] = ensureMinExtent(Math.min(ay, my), Math.max(ay, my), ay);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

// `stage` present ⇒ Shift is held: a corner-resized rect/ellipse is constrained
// to a visual square/circle at the current stage aspect (measured against the
// fixed opposite corner).
export function resizeElement(
  el: SvgElement,
  handle: Handle,
  pt: Vec,
  stage?: StageBox | null,
): SvgElement {
  if (el.kind === 'rect' && handle.kind === 'corner') {
    const anchor = oppositeCorner(elementBounds(el), handle.corner);
    const moving = stage ? constrainRegular(anchor, pt, stage) : pt;
    return { ...el, ...resizedRect(anchor, moving) };
  }
  if (el.kind === 'ellipse' && handle.kind === 'corner') {
    const anchor = oppositeCorner(elementBounds(el), handle.corner);
    const moving = stage ? constrainRegular(anchor, pt, stage) : pt;
    const r = resizedRect(anchor, moving);
    return {
      ...el,
      cx: r.x + r.width / 2,
      cy: r.y + r.height / 2,
      rx: r.width / 2,
      ry: r.height / 2,
    };
  }
  if (el.kind === 'line' && handle.kind === 'endpoint') {
    const p = { x: clamp01(pt.x), y: clamp01(pt.y) };
    return handle.which === 1
      ? { ...el, x1: p.x, y1: p.y }
      : { ...el, x2: p.x, y2: p.y };
  }
  if (el.kind === 'polygon' && handle.kind === 'vertex') {
    const points = el.points.map((v, i) =>
      i === handle.index ? { x: clamp01(pt.x), y: clamp01(pt.y) } : v,
    );
    return { ...el, points };
  }
  return el;
}

export function cursorForHandle(handle: Handle): string {
  switch (handle.kind) {
    case 'corner':
      return handle.corner === 'nw' || handle.corner === 'se'
        ? 'nwse-resize'
        : 'nesw-resize';
    case 'endpoint':
    case 'vertex':
      return 'move';
    default:
      return assertNever(handle);
  }
}
