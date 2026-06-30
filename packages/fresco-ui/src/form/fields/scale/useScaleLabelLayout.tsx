'use client';

import {
  Fragment,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { RenderMarkdown } from '../../../RenderMarkdown';
import { controlLabelVariants } from '../../../styles/controlVariants';
import { cx } from '../../../utils/cva';
import {
  decideScaleLabelTier,
  type ScaleLabelTier,
} from './decideScaleLabelTier';

// Vertical budget for the label band, derived from the viewport so it shrinks
// on short screens (pushing rotated → anchors) and relaxes on tall ones.
const MIN_VERTICAL_BUDGET = 64;
const MAX_VERTICAL_BUDGET = 140;
const VERTICAL_BUDGET_FRACTION = 0.2;
const COS_45 = Math.SQRT1_2;

export type ScaleLabelLayout = {
  tier: ScaleLabelTier;
  /** 45 in LTR, -45 in RTL — labels lean clockwise toward the reading edge. */
  rotateDeg: number;
  /** Horizontal padding (px) the control needs so centred rotated end labels don't clip. */
  overhang: number;
  /** Height (px) the rotated label band occupies. */
  bandHeight: number;
};

const INITIAL: ScaleLabelLayout = {
  tier: 'full',
  rotateDeg: 45,
  overhang: 0,
  bandHeight: 0,
};

function defaultVerticalBudget() {
  const viewportHeight =
    typeof window === 'undefined' ? 768 : window.innerHeight;
  return Math.max(
    MIN_VERTICAL_BUDGET,
    Math.min(MAX_VERTICAL_BUDGET, viewportHeight * VERTICAL_BUDGET_FRACTION),
  );
}

// Measures the rendered labels against the available width and returns the
// layout tier to use, plus a hidden node that must be rendered for measurement.
//
// The observer is wired to the stable outer element (whose width never changes
// with the tier), and `setLayout` only fires on an actual change, so adopting a
// taller tier can't feed back into the measurement and loop.
export function useScaleLabelLayout({
  rootRef,
  labels,
  maxLabelHeight,
}: {
  rootRef: React.RefObject<HTMLElement | null>;
  labels: string[];
  maxLabelHeight?: number;
}): { layout: ScaleLabelLayout; measurementNode: ReactNode } {
  const [layout, setLayout] = useState<ScaleLabelLayout>(INITIAL);

  const nowrapRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const minRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const lineRef = useRef<HTMLSpanElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Latest inputs held in refs so the observer callback stays referentially
  // stable and never re-subscribes the ResizeObserver.
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const maxLabelHeightRef = useRef(maxLabelHeight);
  maxLabelHeightRef.current = maxLabelHeight;

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const availableWidth = root.clientWidth;
    const metrics = labelsRef.current.map((_, i) => ({
      fullWidth: nowrapRefs.current[i]?.getBoundingClientRect().width ?? 0,
      longestWordWidth: minRefs.current[i]?.getBoundingClientRect().width ?? 0,
    }));
    const labelLineHeight =
      lineRef.current?.getBoundingClientRect().height ?? 16;
    const budget = maxLabelHeightRef.current ?? defaultVerticalBudget();

    const tier = decideScaleLabelTier({
      availableWidth,
      labels: metrics,
      maxLabelHeight: budget,
      labelLineHeight,
    });

    const maxFullWidth = metrics.reduce(
      (max, l) => Math.max(max, l.fullWidth),
      0,
    );
    const overhang = Math.round((maxFullWidth / 2) * COS_45 + 8);
    const bandHeight = Math.ceil((maxFullWidth + labelLineHeight) * COS_45 + 8);
    const rotateDeg = getComputedStyle(root).direction === 'rtl' ? -45 : 45;

    setLayout((prev) =>
      prev.tier === tier &&
      prev.overhang === overhang &&
      prev.bandHeight === bandHeight &&
      prev.rotateDeg === rotateDeg
        ? prev
        : { tier, overhang, bandHeight, rotateDeg },
    );
  }, [rootRef]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    measure();
    const observer = new ResizeObserver(() => measure());
    observer.observe(root);
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [measure, rootRef]);

  // Re-measure when the label set or budget changes (not just on resize).
  useLayoutEffect(() => {
    measure();
  }, [labels, maxLabelHeight, measure]);

  const probeClass = cx(controlLabelVariants({ size: 'sm' }), 'inline-block');

  const measurementNode = (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: -99999,
        top: 0,
        visibility: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <span ref={lineRef} className={probeClass}>
        X
      </span>
      {labels.map((label, i) => (
        <Fragment key={`${i}-${label}`}>
          <span
            ref={(el) => {
              nowrapRefs.current[i] = el;
            }}
            className={cx(probeClass, 'whitespace-nowrap')}
          >
            <RenderMarkdown>{label}</RenderMarkdown>
          </span>
          <span
            ref={(el) => {
              minRefs.current[i] = el;
            }}
            className={probeClass}
            style={{ width: 'min-content' }}
          >
            <RenderMarkdown>{label}</RenderMarkdown>
          </span>
        </Fragment>
      ))}
      <div ref={sentinelRef} style={{ width: '1rem', height: '1rem' }} />
    </div>
  );

  return { layout, measurementNode };
}
