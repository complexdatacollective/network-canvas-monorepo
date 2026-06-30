export type ScaleLabelMetric = {
  /** Width of the label rendered on a single line (white-space: nowrap). */
  fullWidth: number;
  /** Width of the label's widest unbreakable run (its longest word). */
  longestWordWidth: number;
};

export type ScaleLabelTier = 'full' | 'rotated' | 'anchors';

export type DecideScaleLabelTierArgs = {
  /** Usable width the label row has to lay out in. */
  availableWidth: number;
  /** One metric per option, in option order. */
  labels: ScaleLabelMetric[];
  /** Vertical budget the label band may occupy before collapsing to anchors. */
  maxLabelHeight: number;
  /** Height of a single line of label text. */
  labelLineHeight: number;
};

// A label that needs more than two lines to fit its cell reads as crowded.
const MAX_FULL_LINES = 2;

// Decide which label layout a scale should use for the measured space.
//
// The Likert grid is `0.5fr (1fr × n-2) 0.5fr`, so the two end cells are half
// width and are the binding constraint — they hold the longest labels
// ("Strongly disagree/agree") in the least room, which is why they clip first.
//
//  - full     — labels wrap within their cells without breaking mid-word.
//  - rotated  — wrapping can't help (a word is wider than its cell, or a label
//               needs >2 lines) but the rotated band still fits the vertical
//               budget.
//  - anchors  — even the rotated band is too tall; show only the end anchors.
export function decideScaleLabelTier({
  availableWidth,
  labels,
  maxLabelHeight,
  labelLineHeight,
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

  const maxFullWidth = labels.reduce((max, l) => Math.max(max, l.fullWidth), 0);
  // Vertical extent of a line of text width w rotated 45°.
  const rotatedBandHeight = (maxFullWidth + labelLineHeight) * Math.SQRT1_2;
  return rotatedBandHeight <= maxLabelHeight ? 'rotated' : 'anchors';
}
