'use client';

import { LayoutGroup } from 'motion/react';
import {
  type CSSProperties,
  memo,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useSelectionManager } from '../contexts';
import { useMeasureItems } from '../hooks/useMeasureItems';
import { useStaggerAnimation } from '../hooks/useStaggerAnimation';
import { useVirtualization } from '../hooks/useVirtualization';
import type { Layout } from '../layout/Layout';
import type { Size } from '../layout/types';
import type { Collection, CollectionProps, ItemRenderer, Key } from '../types';
import { CollectionItem } from './CollectionItem';

type VirtualizedRendererProps<T> = {
  layout: Layout<T>;
  collection: Collection<T>;
  renderItem: ItemRenderer<T>;
  dragAndDropHooks?: CollectionProps<T>['dragAndDropHooks'];
  animate?: boolean;
  animationKey?: string | number;
  collectionId: string;
  scrollRef: RefObject<HTMLElement | null>;
  /** Number of rows to render beyond the visible viewport. Default: 5 */
  overscan?: number;
  layoutGroupId?: string | null;
};

/** A visible item's wrapper, which reports its real size once it mounts. */
function MeasuredItem({
  itemKey,
  onMeasure,
  style,
  children,
}: {
  itemKey: Key;
  onMeasure: (key: Key, size: Size) => void;
  style: CSSProperties;
  children: ReactNode;
}) {
  const measure = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      onMeasure(itemKey, { width: rect.width, height: rect.height });
    },
    [itemKey, onMeasure],
  );

  return (
    <div ref={measure} style={style}>
      {children}
    </div>
  );
}

/**
 * Virtualized renderer that only renders items visible in the viewport.
 * Uses custom measurement and virtualization hooks for efficient scroll windowing.
 *
 * Supports all layout modes (List, Grid, InlineGrid) by:
 * 1. Measuring items in a hidden container
 * 2. Calculating row positions based on measured heights
 * 3. Only rendering rows within the visible viewport (plus overscan)
 *
 * Animation support:
 * - Items animate when entering/exiting the viewport
 * - Layout animations work for items within visible rows
 * - Initial stagger animation applies to first visible items
 */
function VirtualizedRendererComponent<T>({
  layout,
  collection,
  renderItem,
  dragAndDropHooks,
  animate: shouldAnimate,
  animationKey,
  collectionId,
  scrollRef,
  overscan = 5,
  layoutGroupId,
}: VirtualizedRendererProps<T>) {
  // Track container width for layout calculations
  const [containerWidth, setContainerWidth] = useState(0);

  // Get selection manager for scroll-to-focused integration
  const selectionManager = useSelectionManager();

  // Track container width with ResizeObserver (batched to RAF for performance).
  // A passive effect, not a layout effect: `scrollRef` points at an ancestor
  // (the ScrollArea viewport), and React attaches an ancestor's ref only after
  // the layout effects beneath it have run, so a layout effect would see
  // `null` on mount — and, with the store already seeded with items, nothing
  // re-renders this component to try again. The viewport is only ever replaced
  // by remounting everything inside it, this component included.
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return undefined;

    let rafId: number | null = null;
    let pendingWidth: number | null = null;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        pendingWidth = entry.contentRect.width;
      }

      // Batch resize callbacks to animation frame
      rafId ??= requestAnimationFrame(() => {
        if (pendingWidth !== null) {
          setContainerWidth(pendingWidth);
          pendingWidth = null;
        }
        rafId = null;
      });
    });

    // Initial width - use content width (excluding padding) to match ResizeObserver's contentRect
    const computedStyle = getComputedStyle(scrollElement);
    const paddingX =
      Number.parseFloat(computedStyle.paddingLeft) +
      Number.parseFloat(computedStyle.paddingRight);
    const initialWidth = scrollElement.clientWidth - paddingX;
    setContainerWidth(initialWidth);

    observer.observe(scrollElement);
    return () => {
      observer.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [scrollRef]);

  // Measure items in hidden container (initial sample) + expose a
  // `reportItemSize` callback that individual visible items use to upgrade
  // the initial estimates with their real size once mounted.
  const { measurements, isComplete, measurementContainer, reportItemSize } =
    useMeasureItems({
      collection,
      layout,
      renderItem,
      containerWidth,
      skip: containerWidth === 0,
    });

  // --- Lazy measurement of items in the viewport --------------------------
  //
  // Items rendered by the virtualized loop below are measured when their
  // outer wrapper `<div>` mounts (`MeasuredItem`'s ref callback fires). We read the real
  // content rect via `getBoundingClientRect` and hand it to
  // `reportItemSize`, which batch-merges the new value into the
  // measurement map on the next animation frame. This refines the
  // sample-based estimates over time without ever touching off-screen
  // items, and avoids ResizeObserver's async delivery (which is unreliable
  // when the main thread is busy, and completely silent inside an
  // automated iframe).
  //
  // Cadence:
  // - On mount: one measurement per item (the `reportItemSize` tolerance
  //   check drops the report if it matches what the layout already thinks).
  // - On re-render: each item's ref callback keeps its identity (its key and
  //   `reportItemSize` never change), so React does not re-run it and stable
  //   items don't re-measure.
  //
  // Trade-off vs. ResizeObserver: we won't automatically pick up in-place
  // content-size changes that happen *after* mount (e.g. an item whose
  // inner content grows due to an async data load). That's an acceptable
  // loss for the common case of roughly-static rendered content, and
  // matches how most virtualized libraries work.

  // Get rows from layout after measurements complete
  // Must update layout with containerWidth BEFORE calling updateWithMeasurements
  // because updateWithMeasurements uses this.containerWidth internally
  const rows = useMemo(() => {
    // Wait for measurements to complete and container to have width
    if (!isComplete || containerWidth === 0) return [];
    // Update layout with current container width first
    layout.update({ containerWidth });
    // Then apply measurements (which uses containerWidth internally)
    if (measurements.size > 0) {
      layout.updateWithMeasurements(measurements);
    }
    return layout.getRows();
  }, [layout, isComplete, measurements, containerWidth]);

  // Virtualize rows
  const { virtualItems, totalHeight, scrollToKey } = useVirtualization({
    rows,
    scrollRef,
    overscan,
  });

  // Scroll to focused key when it changes (for typeahead support)
  useEffect(() => {
    if (selectionManager.focusedKey !== null) {
      scrollToKey(selectionManager.focusedKey);
    }
  }, [selectionManager.focusedKey, scrollToKey]);

  // Get layout styles for row items
  const containerStyle = layout.getContainerStyles();

  const rowStyle = {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    // Use container styles for row layout (flex/grid)
    ...containerStyle,
    // Override height-related styles since we position absolutely
    minHeight: undefined,
    height: 'auto',
  };

  // Calculate visible item count for stagger animation
  const visibleItemCount = virtualItems.reduce(
    (sum, { row }) => sum + row.itemKeys.length,
    0,
  );

  const scope = useStaggerAnimation(
    shouldAnimate ?? false,
    visibleItemCount,
    animationKey,
  );

  const effectiveLayoutGroupId =
    layoutGroupId === undefined ? collectionId : (layoutGroupId ?? undefined);

  // No `AnimatePresence` here: its direct children are plain `<div>`s (row
  // wrappers), not motion components, so `AnimatePresence` would have nothing
  // to track for enter/exit animations — it would just add context overhead
  // without behavioural benefit. `LayoutGroup` is kept so that nested
  // user-provided motion components (from `renderItem`) still coordinate
  // layout animations with each other.
  const itemStyle = layout.getItemStyles();

  return (
    <>
      {measurementContainer}
      <LayoutGroup id={effectiveLayoutGroupId}>
        <div
          className="relative w-full"
          style={{ height: totalHeight }}
          ref={scope}
        >
          {virtualItems.map(({ row, offsetTop }) => (
            <div
              key={row.rowIndex}
              style={{
                ...rowStyle,
                transform: `translateY(${offsetTop}px)`,
              }}
            >
              {row.itemKeys.map((key) => {
                const node = collection.getItem(key);
                if (!node) return null;

                return (
                  <MeasuredItem
                    key={key}
                    itemKey={key}
                    onMeasure={reportItemSize}
                    style={itemStyle}
                  >
                    <div data-stagger-item data-stagger-key={animationKey}>
                      <CollectionItem
                        node={node}
                        renderItem={renderItem}
                        dragAndDropHooks={dragAndDropHooks}
                        layout={layout}
                      />
                    </div>
                  </MeasuredItem>
                );
              })}
            </div>
          ))}
        </div>
      </LayoutGroup>
    </>
  );
}

/**
 * Memoized so that unrelated parent re-renders (e.g. a context provider
 * further up the tree changing identity) do not trigger reconciliation of
 * all visible virtual items.
 */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- memo() erases the component's generic parameter; this is the same component with it restored
export const VirtualizedRenderer = memo(
  VirtualizedRendererComponent,
) as typeof VirtualizedRendererComponent;
