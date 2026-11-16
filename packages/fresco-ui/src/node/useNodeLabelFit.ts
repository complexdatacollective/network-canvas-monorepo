'use client';

import { useRef, useState } from 'react';

import { useFitText } from '../hooks/useFitText';
import { withLabelBreakPoints } from '../utils/labelBreakPoints';
import { type ParsedNodeShapeSvg } from './nodeShapeSvg';

// An artwork with a label plate lets the label outgrow its area: once no size
// fits, the last three rungs of its ladder set the label at the floor size
// with no height limit but the floor's line clamp, and the plate is drawn
// taller to hold it. Whole words come first, then the breaking rungs.
const GROWN_RUNGS = 3;
// The breaking rungs are the last two of every ladder.
const BREAKING_RUNGS = 2;

type UseNodeLabelFitOptions = {
  label: string;
  /** The ladder for this node's size and shape, largest type first. */
  steps: readonly [string, ...string[]];
  /** The node's custom artwork, if it has one. */
  customShape: ParsedNodeShapeSvg | null;
  loading: boolean;
};

/**
 * Fits a node's label to its label box, and works out what a custom shape
 * does with the result: how many whole lines its label area shows, and how
 * much taller its label plate is drawn for a label that outgrew the area.
 */
export function useNodeLabelFit({
  label,
  steps,
  customShape,
  loading,
}: UseNodeLabelFitOptions) {
  const labelBoxRef = useRef<HTMLSpanElement>(null);

  // A label that only fits once words are broken is shown with break points
  // marked in it (see `withLabelBreakPoints`). They are added only after a fit
  // has landed on a breaking rung for this very label, so the great majority
  // of names are rendered exactly as given.
  const [breakPointsFor, setBreakPointsFor] = useState<string>();
  const markBreakPoints = breakPointsFor === label;
  const displayedLabel = markBreakPoints ? withLabelBreakPoints(label) : label;
  const fitKey = `${markBreakPoints ? 'breakable' : 'plain'}:${label}`;
  const {
    ref: labelRef,
    stepIndex,
    isTruncated,
    wholeLines,
    overflow,
    fittedWatch,
  } = useFitText<HTMLSpanElement>({
    steps,
    containerRef: labelBoxRef,
    watch: fitKey,
    enabled: !loading,
  });
  if (
    stepIndex >= steps.length - BREAKING_RUNGS &&
    fittedWatch === fitKey &&
    !markBreakPoints &&
    withLabelBreakPoints(label) !== label
  ) {
    setBreakPointsFor(label);
  }

  const labelGrown =
    customShape?.labelPlate === true &&
    !loading &&
    stepIndex >= steps.length - GROWN_RUNGS;

  // How far the grown label reaches past its area, in the artwork's viewBox
  // units, which is what the plate is drawn in. The area's height is a
  // fraction of the square node box, which the viewBox's longer side spans.
  const labelPlateGrowth =
    labelGrown && overflow > 0
      ? Math.round(
          overflow *
            customShape.labelArea.height *
            Math.max(customShape.viewBox.width, customShape.viewBox.height) *
            10,
        ) / 10
      : 0;

  // A label area holds fewer lines than the ladder's clamps allow for, so a
  // label cut short in one is clamped to the lines that are whole.
  const labelLineClamp =
    customShape && isTruncated && !labelGrown ? wholeLines : undefined;

  return {
    labelBoxRef,
    labelRef,
    labelClassName: steps[stepIndex] ?? steps[0],
    displayedLabel,
    isTruncated,
    labelLineClamp,
    labelPlateGrowth,
  };
}
