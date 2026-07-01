export type ScaleLabelMetric = {
  /** Width of the label rendered on a single line (white-space: nowrap). */
  fullWidth: number;
  /** Width of the label's widest unbreakable run (its longest word). */
  longestWordWidth: number;
  /** Width of the label wrapped within the rotated-label max-width cap. */
  wrappedWidth: number;
  /** Height of the label wrapped within the rotated-label max-width cap. */
  wrappedHeight: number;
};

export type ScaleLabelTier = 'full' | 'rotated' | 'anchors';

export type DecideScaleLabelTierArgs = {
  /** Usable width the label row has to lay out in. */
  availableWidth: number;
  /** One metric per option, in option order. */
  labels: ScaleLabelMetric[];
  /** Vertical budget the label band may occupy before collapsing to anchors. */
  maxLabelHeight: number;
};

// A label that needs more than two lines to fit its cell reads as crowded.
const MAX_FULL_LINES = 2;

// Horizontal chrome between the field edge and the track on each side combined
// (the control's `px-3`). Used to estimate the track width from the field width.
const TRACK_HORIZONTAL_CHROME = 24;

// The rotated band's height is the vertical extent of the tallest label block
// rotated 45°. A w×h block rotated 45° has bounding-box height (w + h) · sin45.
export function rotatedBandExtent(labels: ScaleLabelMetric[]): number {
  const maxSpan = labels.reduce(
    (max, l) => Math.max(max, l.wrappedWidth + l.wrappedHeight),
    0,
  );
  return maxSpan * Math.SQRT1_2;
}

// Decide which label layout a scale should use for the measured space.
//
// The Likert grid is `0.5fr (1fr × n-2) 0.5fr`, so the two end cells are half
// width and are the binding constraint — they hold the longest labels
// ("Strongly disagree/agree") in the least room, which is why they clip first.
//
//  - full     — labels wrap within their cells without breaking mid-word.
//  - rotated  — wrapping can't help (a word is wider than its cell, or a label
//               needs >2 lines) but the rotated band fits the vertical budget
//               and the labels don't overlap their neighbours.
//  - anchors  — the rotated band is too tall, or the labels are so tall they'd
//               collide; show only the end anchors.
export function decideScaleLabelTier({
  availableWidth,
  labels,
  maxLabelHeight,
}: DecideScaleLabelTierArgs): ScaleLabelTier {
  const n = labels.length;
  if (availableWidth <= 0 || n <= 1) return 'full';

  const unit = n >= 3 ? availableWidth / (n - 1) : availableWidth / n;

  let fitsAsFull = true;
  for (let i = 0; i < n; i++) {
    const metric = labels[i]!;
    const isEndCell = n >= 3 && (i === 0 || i === n - 1);
    const cellWidth = isEndCell ? unit / 2 : unit;

    // A single word can't wrap narrower than itself.
    if (metric.longestWordWidth > cellWidth) {
      fitsAsFull = false;
      break;
    }
    if (Math.ceil(metric.fullWidth / cellWidth) > MAX_FULL_LINES) {
      fitsAsFull = false;
      break;
    }
  }
  if (fitsAsFull) return 'full';

  // Too tall for the vertical budget.
  const extent = rotatedBandExtent(labels);
  if (extent > maxLabelHeight) return 'anchors';

  // Rotated labels share a vertical centre line, so neighbours overlap unless
  // the tick spacing leaves enough perpendicular gap (spacing · sin45) for a
  // block's wrapped height. The track is the field width minus the control's
  // horizontal padding and the rotated overhang (≈ the band extent).
  const trackWidth = availableWidth - TRACK_HORIZONTAL_CHROME - extent;
  const tickSpacing = trackWidth / (n - 1);
  const maxWrappedHeight = labels.reduce(
    (max, l) => Math.max(max, l.wrappedHeight),
    0,
  );
  return tickSpacing * Math.SQRT1_2 >= maxWrappedHeight ? 'rotated' : 'anchors';
}
