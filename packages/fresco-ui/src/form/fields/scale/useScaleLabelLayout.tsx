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
  rotatedBboxExtent,
  type ScaleLabelTier,
} from './decideScaleLabelTier';

// The Likert label grid: half-width end cells so the first/last labels align to
// the track edges and the interior cells centre on their ticks. Shared by the
// rendered grid and the hidden measurement replica so cell widths match.
export function scaleGridTemplateColumns(count: number) {
  if (count <= 2) return `repeat(${count}, minmax(0, 1fr))`;
  return `minmax(0, 0.5fr) repeat(${count - 2}, minmax(0, 1fr)) minmax(0, 0.5fr)`;
}

// A rotated label wraps to its longest word (min-content), so it never breaks
// mid-word. Shared by the rendered label and the measurement probe.
export const ROTATED_LABEL_WRAP_CLASS = 'w-min';

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

// Measures the labels against the real layout and returns the tier to use, plus
// a hidden node that must be rendered for measurement. Everything is derived
// from measured element sizes: a replica of the full grid yields the real cell
// widths and tick spacing, and a min-content probe yields each label's
// longest-word width and wrapped height.
//
// The observer watches the stable outer element (whose width never changes with
// the tier) and `setLayout` only fires on an actual change, so adopting a taller
// tier can't feed back into the measurement and loop.
export function useScaleLabelLayout({
  rootRef,
  labels,
}: {
  rootRef: React.RefObject<HTMLElement | null>;
  labels: string[];
}): { layout: ScaleLabelLayout; measurementNode: ReactNode } {
  const [layout, setLayout] = useState<ScaleLabelLayout>(INITIAL);

  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const minRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const labelsRef = useRef(labels);
  labelsRef.current = labels;

  const measure = useCallback(() => {
    if (!rootRef.current) return;

    const n = labelsRef.current.length;
    const cells = cellRefs.current
      .slice(0, n)
      .map((el) => el?.getBoundingClientRect());
    const first = cells[0];
    const last = cells[n - 1];
    const trackWidth = first && last ? last.right - first.left : 0;
    const tickSpacing = n > 1 ? trackWidth / (n - 1) : trackWidth;

    const metrics = labelsRef.current.map((_, i) => {
      const min = minRefs.current[i]?.getBoundingClientRect();
      return {
        longestWordWidth: min?.width ?? 0,
        wrappedHeight: min?.height ?? 0,
        cellWidth: cells[i]?.width ?? 0,
      };
    });

    const tier = decideScaleLabelTier({ labels: metrics, tickSpacing });
    const extent = rotatedBboxExtent(metrics);
    const overhang = Math.ceil(extent / 2);
    const bandHeight = Math.ceil(extent);
    const rotateDeg =
      getComputedStyle(rootRef.current).direction === 'rtl' ? -45 : 45;

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

  // Re-measure when the label set changes (not just on resize).
  useLayoutEffect(() => {
    measure();
  }, [labels, measure]);

  const probeClass = cx(controlLabelVariants({ size: 'sm' }), 'inline-block');

  const measurementNode = (
    <div
      aria-hidden="true"
      className="pointer-events-none invisible absolute inset-x-0 top-0"
    >
      <div
        className="grid gap-2 px-3"
        style={{ gridTemplateColumns: scaleGridTemplateColumns(labels.length) }}
      >
        {labels.map((_, i) => (
          <div
            key={i}
            ref={(el) => {
              cellRefs.current[i] = el;
            }}
          />
        ))}
      </div>
      {labels.map((label, i) => (
        <Fragment key={`${i}-${label}`}>
          <span
            ref={(el) => {
              minRefs.current[i] = el;
            }}
            className={cx(probeClass, ROTATED_LABEL_WRAP_CLASS)}
          >
            <RenderMarkdown>{label}</RenderMarkdown>
          </span>
        </Fragment>
      ))}
      <div ref={sentinelRef} className="h-4 w-4" />
    </div>
  );

  return { layout, measurementNode };
}
