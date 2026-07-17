import type { BackgroundDocument, Vec } from '~/model/types';

import { elementBounds, type StageBox } from './documentGeometry';

// Pure screen-space snapping shared by every drag gesture (moving, resizing,
// drawing). Kept beside documentGeometry in `state/` so the store and the canvas
// overlay reach it without either importing from `canvas/`. Everything here is a
// pure function of its arguments; the caller owns the live stage box, the Alt
// bypass, and the transient guide chrome.

// Default snap distance in device pixels, converted per-axis against the live
// stage box so the pull feels the same on any aspect. Deliberately generous so
// grabbing an alignment is easy without fighting free positioning.
export const SNAP_THRESHOLD_PX = 6;

// Candidate alignment lines in normalized space, one list per axis.
export type SnapLines = { x: number[]; y: number[] };

// Which axes to snap. A shift-constrained gesture leaves the constrained axis
// out (it is derived from the free axis, so snapping it would fight the
// constraint) by passing `{ x: true, y: false }`.
export type SnapAxes = { x?: boolean; y?: boolean };

// Active guide positions in normalized space (null = no snap on that axis).
export type SnapGuides = { x: number | null; y: number | null };

// The return shape of computeSnap; consumers read `.point`/`.guides` structurally
// rather than naming it, so it stays module-local.
type SnapResult = {
  point: Vec;
  guides: SnapGuides;
};

export const NO_GUIDES: SnapGuides = { x: null, y: null };

// The alignment lines a dragged shape can snap to: the canvas frame (near edge,
// centre, far edge on each axis) plus every other element's bounding-box edges
// and centre. `excludeId` drops the dragged element so a shape never snaps to
// itself. Candidates are static for the duration of a gesture (only the dragged
// element changes), so callers compute this once per gesture.
export function snapLines(
  doc: BackgroundDocument,
  excludeId: string | null,
): SnapLines {
  const x: number[] = [0, 0.5, 1];
  const y: number[] = [0, 0.5, 1];
  for (const el of doc.elements) {
    if (el.id === excludeId) continue;
    const b = elementBounds(el);
    x.push(b.minX, (b.minX + b.maxX) / 2, b.maxX);
    y.push(b.minY, (b.minY + b.maxY) / 2, b.maxY);
  }
  return { x, y };
}

// Nearest candidate to `value` within `threshold`; null when none qualifies.
// Strict `<` on the running best means an exact distance tie keeps the earlier
// candidate (canvas frame lines come first), so ties resolve deterministically.
function nearestLine(
  value: number,
  candidates: number[],
  threshold: number,
): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const candidate of candidates) {
    const dist = Math.abs(candidate - value);
    if (dist <= threshold && dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}

// Snaps `point` to the nearest candidate line on each axis independently, using
// a screen-space threshold converted to normalized units against the live stage
// box (so x and y use their own pixel extents). The returned point substitutes
// the snapped value on any axis that caught a line; the guides report which
// lines are active so the overlay can draw them. Alt-bypass is the caller's
// responsibility — when the user holds Alt it simply skips calling this.
export function computeSnap(
  point: Vec,
  candidates: SnapLines,
  stage: StageBox,
  options?: { thresholdPx?: number; axes?: SnapAxes },
): SnapResult {
  const thresholdPx = options?.thresholdPx ?? SNAP_THRESHOLD_PX;
  const snapX = options?.axes?.x ?? true;
  const snapY = options?.axes?.y ?? true;
  const thresholdX = stage.width > 0 ? thresholdPx / stage.width : 0;
  const thresholdY = stage.height > 0 ? thresholdPx / stage.height : 0;
  const guideX = snapX ? nearestLine(point.x, candidates.x, thresholdX) : null;
  const guideY = snapY ? nearestLine(point.y, candidates.y, thresholdY) : null;
  return {
    point: { x: guideX ?? point.x, y: guideY ?? point.y },
    guides: { x: guideX, y: guideY },
  };
}
