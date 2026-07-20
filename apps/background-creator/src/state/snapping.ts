import type { BackgroundDocument, Vec } from '~/model/types';

import {
  type Bounds,
  clamp01,
  elementBounds,
  type StageBox,
} from './documentGeometry';

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
  stage: StageBox | null = null,
): SnapLines {
  const x: number[] = [0, 0.5, 1];
  const y: number[] = [0, 0.5, 1];
  for (const el of doc.elements) {
    if (el.id === excludeId) continue;
    // Measured (stage-aware) bounds keep a text element's edge candidates on
    // its rendered extent; the approximation would offer phantom snap edges.
    // Clamp to the canvas — a text element whose measured extent spills past
    // an edge would otherwise offer an off-canvas candidate that the snap could
    // adopt, committing an endpoint outside [0,1] that the schema rejects.
    const b = elementBounds(el, stage);
    x.push(clamp01(b.minX), clamp01((b.minX + b.maxX) / 2), clamp01(b.maxX));
    y.push(clamp01(b.minY), clamp01((b.minY + b.maxY) / 2), clamp01(b.maxY));
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

// Converts the device-pixel threshold to normalized units for one axis against
// that axis's pixel extent; a zero extent disables snapping (threshold 0).
function axisThreshold(extent: number, thresholdPx: number): number {
  return extent > 0 ? thresholdPx / extent : 0;
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
  const thresholdX = axisThreshold(stage.width, thresholdPx);
  const thresholdY = axisThreshold(stage.height, thresholdPx);
  const guideX = snapX ? nearestLine(point.x, candidates.x, thresholdX) : null;
  const guideY = snapY ? nearestLine(point.y, candidates.y, thresholdY) : null;
  return {
    point: { x: guideX ?? point.x, y: guideY ?? point.y },
    guides: { x: guideX, y: guideY },
  };
}

// The moving shape's three alignment probes on one axis (near edge, centre, far
// edge) tested against every candidate line. The (probe, line) pair with the
// smallest distance within `threshold` wins; the adjustment shifts that probe
// exactly onto the line. Strict `<` mirrors nearestLine's tie-break, so a
// distance tie keeps the earlier probe/candidate. Null when nothing qualifies.
function nearestBoundsLine(
  probes: number[],
  candidates: number[],
  threshold: number,
): { line: number; adjustment: number } | null {
  let best: { line: number; adjustment: number } | null = null;
  let bestDist = Infinity;
  for (const probe of probes) {
    for (const candidate of candidates) {
      const dist = Math.abs(candidate - probe);
      if (dist <= threshold && dist < bestDist) {
        best = { line: candidate, adjustment: candidate - probe };
        bestDist = dist;
      }
    }
  }
  return best;
}

// The return shape of computeBoundsSnap; consumers read `.delta`/`.guides`
// structurally rather than naming it, so it stays module-local.
type BoundsSnapResult = {
  delta: Vec;
  guides: SnapGuides;
};

// Shape-relative move snapping. Where computeSnap aligns a single dragged point,
// this aligns a moving bounding box: on each axis the box offers its min, centre
// and max as probes, and the nearest probe-to-candidate match within the
// screen-space threshold decides the axis. The returned `delta` is the extra
// normalized translation that lands the winning probe on its line (the caller
// adds it to the raw drag delta); `guides` report the matched lines so the
// overlay can draw them. Axes resolve independently; an axis with no match
// contributes a zero delta and a null guide. Alt-bypass is the caller's
// responsibility — when the user holds Alt it simply skips calling this.
export function computeBoundsSnap(
  bounds: Bounds,
  candidates: SnapLines,
  stage: StageBox,
  options?: { thresholdPx?: number; axes?: SnapAxes },
): BoundsSnapResult {
  const thresholdPx = options?.thresholdPx ?? SNAP_THRESHOLD_PX;
  const snapX = options?.axes?.x ?? true;
  const snapY = options?.axes?.y ?? true;
  const thresholdX = axisThreshold(stage.width, thresholdPx);
  const thresholdY = axisThreshold(stage.height, thresholdPx);
  const centreX = (bounds.minX + bounds.maxX) / 2;
  const centreY = (bounds.minY + bounds.maxY) / 2;
  const hitX = snapX
    ? nearestBoundsLine(
        [bounds.minX, centreX, bounds.maxX],
        candidates.x,
        thresholdX,
      )
    : null;
  const hitY = snapY
    ? nearestBoundsLine(
        [bounds.minY, centreY, bounds.maxY],
        candidates.y,
        thresholdY,
      )
    : null;
  return {
    delta: { x: hitX?.adjustment ?? 0, y: hitY?.adjustment ?? 0 },
    guides: { x: hitX?.line ?? null, y: hitY?.line ?? null },
  };
}
