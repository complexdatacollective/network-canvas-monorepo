'use client';

import { type RefObject, useCallback } from 'react';

import { useFitText } from '@codaco/fresco-ui/hooks/useFitText';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import { headingVariants } from '@codaco/fresco-ui/typography/Heading';

// A circular bin's label is sized against the bin's own diameter, so a small
// circle shrinks its text smoothly instead of jumping down the type scale.
// `cqi` resolves against `.catbin-item`. The ceilings are the type scale's own
// fluid sizes, topping out at the `text-lg` these labels have always used and
// never going above it; the floor is `text-xs`, readable at arm's length on a
// tablet.
const CIRCLE_RUNGS = [
  'text-[length:clamp(var(--text-xs),11cqi,var(--text-lg))] leading-tight',
  'text-[length:clamp(var(--text-xs),9cqi,var(--text-base))] leading-tight',
  'text-[length:clamp(var(--text-xs),7cqi,var(--text-sm))] leading-tight',
  'text-[length:clamp(var(--text-xs),5.5cqi,var(--text-sm))] leading-[1.15]',
  'text-[length:var(--text-xs)] leading-[1.15]',
] as const;

// An ordinal header is wide and short, so its width says nothing about how much
// type it can hold; it steps down the shared type scale instead.
const HEADER_RUNGS = [
  'text-lg leading-tight',
  'text-base leading-tight',
  'text-sm leading-tight',
  'text-sm leading-[1.15]',
  'text-xs leading-[1.15]',
] as const;

// Conceded only below the floor: a broken word is harder to read than a whole
// one a size down.
const HYPHENATED_BREAKS = 'hyphens-auto [hyphenate-limit-chars:6_3_2]';
const EMERGENCY_BREAKS = 'wrap-anywhere';

// No rung carries a line clamp. A clamp caps lines independently of the room the
// bin has, so a label with space to spare is pushed down a size — which is how a
// short label ends up smaller than a long one. The box height is the only limit,
// and `text-balance` evens the lines it produces rather than leaving a lone word
// on the last one. The height cap and `wrap-normal` are what let the fitter see
// a rung is too big: it decides by measuring the label's overflow of its own
// box, so the box has to be the bin's room, and a word too long for a line has
// to overflow rather than break. The cap is a variable so a bin can reserve part
// of itself for something else without the theme having to out-cascade a
// utility. `strong` goes to 900 because the heading is already bold at 700, and
// an authored **emphasis** that renders identically to the rest of the label is
// not emphasis; Nunito's weight axis runs to 1000, so the step is real.
const BASE =
  'block max-h-(--bin-label-max,100%) w-full min-w-0 overflow-hidden text-center text-balance wrap-normal [&_strong]:font-black';

const buildSteps = (
  rungs: readonly string[],
  level: 'h3' | 'h4',
): readonly [string, ...string[]] => {
  const rung = (className: string) =>
    headingVariants({
      level,
      margin: 'none',
      className: `${BASE} ${className}`,
    });
  const floor = rungs.at(-1)!;
  return [
    ...rungs.map(rung),
    rung(`${floor} ${HYPHENATED_BREAKS}`),
    rung(`${floor} ${EMERGENCY_BREAKS}`),
  ] as unknown as readonly [string, ...string[]];
};

const STEPS = {
  circle: buildSteps(CIRCLE_RUNGS, 'h4'),
  header: buildSteps(HEADER_RUNGS, 'h4'),
} as const;

type BinLabelProps = {
  label: string;
  /** The fixed-size box the label has to fit inside — never the label itself. */
  containerRef: RefObject<HTMLElement | null>;
  /** Which ladder to use: a bin's own diameter, or the shared type scale. */
  variant: keyof typeof STEPS;
  /**
   * Receives the fitted heading, for callers that need its height. The label
   * never shrinks to make room for anything else, so that height is stable
   * whatever the caller does with it.
   */
  elementRef?: RefObject<HTMLHeadingElement | null>;
  /**
   * Anything that changes the label's box without changing the size of the box
   * it is fitted inside — a bin reserving part of itself for a summary, say.
   * The fitter watches the container for changes, so one it cannot see there
   * has to be declared here or the label keeps a rung it no longer fits.
   */
  refitOn?: string;
};

/**
 * A bin's option label, fitted to the space the bin actually has. Response
 * options are routinely whole sentences, so the label steps down a size at a
 * time rather than being clipped — as a person's name is on a node.
 */
const BinLabel = ({
  label,
  containerRef,
  variant,
  elementRef,
  refitOn,
}: BinLabelProps) => {
  const steps = STEPS[variant];
  const {
    ref: fitRef,
    stepIndex,
    isTruncated,
  } = useFitText<HTMLHeadingElement>({
    steps,
    containerRef,
    watch: refitOn === undefined ? label : `${label}\u0000${refitOn}`,
  });

  const mergedRef = useCallback(
    (element: HTMLHeadingElement | null) => {
      fitRef.current = element;
      if (elementRef) elementRef.current = element;
    },
    [fitRef, elementRef],
  );

  return (
    <h4
      ref={mergedRef}
      className={steps[stepIndex] ?? steps[0]}
      data-bin-label-truncated={isTruncated || undefined}
    >
      <RenderMarkdown>{label}</RenderMarkdown>
    </h4>
  );
};

export default BinLabel;
