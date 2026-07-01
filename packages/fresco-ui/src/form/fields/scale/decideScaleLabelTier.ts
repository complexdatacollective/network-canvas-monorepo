export type ScaleLabelMetric = {
  /** Min-content width (the longest word) — also the width a rotated label wraps to. */
  longestWordWidth: number;
  /** Height when wrapped to the longest word — the rotated block's height. */
  wrappedHeight: number;
  /** Measured width of this label's cell in the full-tier grid. */
  cellWidth: number;
};

export type ScaleLabelTier = 'full' | 'rotated' | 'anchors';

export type DecideScaleLabelTierArgs = {
  /** One metric per option, in option order. */
  labels: ScaleLabelMetric[];
  /** Measured distance between adjacent ticks. */
  tickSpacing: number;
};

// Bounding-box extent of the tallest rotated label block: a w×h block rotated
// 45° spans (w + h)·sin45 in each axis. Everything is derived from measured
// label sizes — there are no tunable pixel thresholds.
export function rotatedBboxExtent(labels: ScaleLabelMetric[]): number {
  return labels.reduce(
    (max, l) =>
      Math.max(max, (l.longestWordWidth + l.wrappedHeight) * Math.SQRT1_2),
    0,
  );
}

// Decide which label layout a scale should use for the measured space.
//
//  - full     — every label's longest word fits its cell, so labels wrap at word
//               boundaries (never mid-word).
//  - rotated  — a word no longer fits its cell, but each label's rotated bounding
//               box still fits within its tick spacing (no overlap, no spilling).
//  - anchors  — even rotated the boxes would collide or overflow; show only the
//               two end anchors.
export function decideScaleLabelTier({
  labels,
  tickSpacing,
}: DecideScaleLabelTierArgs): ScaleLabelTier {
  const n = labels.length;
  // Not measured yet, or nothing to lay out.
  if (n <= 1 || tickSpacing <= 0 || labels.some((l) => l.cellWidth <= 0)) {
    return 'full';
  }

  if (labels.every((l) => l.longestWordWidth <= l.cellWidth)) return 'full';

  return rotatedBboxExtent(labels) <= tickSpacing ? 'rotated' : 'anchors';
}
