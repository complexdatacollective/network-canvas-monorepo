'use client';

import {
  type CSSProperties,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useMergeRefs } from 'react-best-merge-refs';

import { cx } from './utils/cva';

type ScrollSnapType = 'mandatory' | 'proximity';

type ScrollSnapAxis = 'x' | 'y' | 'both';

type ScrollAreaProps = {
  'viewportClassName'?: string;
  /** Whether to show gradient fade at scroll edges. Defaults to true. */
  'fade'?: boolean;
  /** Scroll orientation. Defaults to 'vertical'. */
  'orientation'?: 'vertical' | 'horizontal';
  /** Enable scroll-snap behavior. Children should use 'snap-start', 'snap-center', or 'snap-end' classes. */
  'snap'?: ScrollSnapType;
  /** Axis for scroll-snap. Defaults to 'both'. Only applies when snap is set. */
  'snapAxis'?: ScrollSnapAxis;
  /**
   * Change this value to force a re-measurement of scroll dimensions.
   * Useful when children run layout animations (e.g. Framer Motion `layout`)
   * that temporarily distort scrollWidth/clientWidth. Pass a value that
   * changes when the animation completes to trigger a fresh measurement.
   */
  'remeasureKey'?: unknown;
  /** Optional accessible label for the scroll region. */
  'aria-label'?: string;
  /**
   * Drop the accessible name while the viewport is not a tab stop.
   *
   * For a caller that names the region only so that the STOP announces
   * something. A named `<section>` is a `region` landmark, so a name that is
   * always applied adds a landmark whether or not there is anything to reach —
   * which inside a dialog means a landmark repeating the dialog's own name. A
   * caller that wants the landmark regardless should just pass a name and leave
   * this alone.
   * @default false
   */
  'nameWhenScrollableOnly'?: boolean;
} & Omit<
  React.HTMLAttributes<HTMLElement>,
  | 'onDrag'
  | 'onDragEnd'
  | 'onDragStart'
  | 'onAnimationStart'
  | 'onAnimationEnd'
  | 'onAnimationIteration'
>;

const ScrollArea = forwardRef<HTMLElement, ScrollAreaProps>(
  (
    {
      className,
      viewportClassName,
      children,
      fade = true,
      orientation = 'vertical',
      snap,
      snapAxis = 'both',
      remeasureKey,
      tabIndex,
      nameWhenScrollableOnly = false,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
      ...rest
    },
    ref,
  ) => {
    const viewportRef = useRef<HTMLElement>(null);
    const rafIdRef = useRef<number | null>(null);
    const [overflows, setOverflows] = useState(false);

    const updateScrollVariables = useCallback(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      // Cancel any pending rAF to avoid stale updates during animations
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }

      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;

        // Verify viewport still exists after async callbacks
        if (!viewportRef.current) return;

        const {
          scrollTop,
          scrollHeight,
          clientHeight,
          scrollLeft,
          scrollWidth,
          clientWidth,
        } = viewportRef.current;

        const styles = getComputedStyle(viewportRef.current);
        const padTop = Number.parseFloat(styles.paddingBlockStart);
        const padBottom = Number.parseFloat(styles.paddingBlockEnd);
        const padLeft = Number.parseFloat(styles.paddingInlineStart);
        const padRight = Number.parseFloat(styles.paddingInlineEnd);

        // Vertical overflow — subtract padding so the fade only appears
        // once content (not just padding) has scrolled past the edge.
        const hasVerticalOverflow = scrollHeight > clientHeight;
        const overflowYStart = hasVerticalOverflow
          ? Math.max(0, scrollTop - padTop)
          : 0;
        const overflowYEnd = hasVerticalOverflow
          ? Math.max(0, scrollHeight - clientHeight - scrollTop - padBottom)
          : 0;

        viewportRef.current.style.setProperty(
          '--scroll-area-overflow-y-start',
          `${overflowYStart}px`,
        );
        viewportRef.current.style.setProperty(
          '--scroll-area-overflow-y-end',
          `${overflowYEnd}px`,
        );

        // Inset fade pseudo-elements to avoid covering the scrollbar
        const scrollbarWidth =
          viewportRef.current.offsetWidth - viewportRef.current.clientWidth;
        viewportRef.current.style.setProperty(
          '--scrollbar-width',
          `${scrollbarWidth}px`,
        );

        // Horizontal overflow
        const hasHorizontalOverflow = scrollWidth > clientWidth;

        // Drives the tab stop. Set from the same measurement that drives the
        // fades, but deliberately OUTSIDE the `fade` gate below — a region with
        // `fade={false}` still scrolls, and would otherwise never be reachable
        // by keyboard.
        setOverflows(hasVerticalOverflow || hasHorizontalOverflow);
        const overflowXStart = hasHorizontalOverflow
          ? Math.max(0, scrollLeft - padLeft)
          : 0;
        const overflowXEnd = hasHorizontalOverflow
          ? Math.max(0, scrollWidth - clientWidth - scrollLeft - padRight)
          : 0;

        viewportRef.current.style.setProperty(
          '--scroll-area-overflow-x-start',
          `${overflowXStart}px`,
        );
        viewportRef.current.style.setProperty(
          '--scroll-area-overflow-x-end',
          `${overflowXEnd}px`,
        );

        const scrollbarHeight =
          viewportRef.current.offsetHeight - viewportRef.current.clientHeight;
        viewportRef.current.style.setProperty(
          '--scrollbar-height',
          `${scrollbarHeight}px`,
        );
      });
    }, []);

    // Runs whether or not `fade` is on: it is the only source of the overflow
    // measurement that decides the tab stop, and `fade={false}` regions
    // (validation error lists, faceted filters) scroll like any other.
    useEffect(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      // Initial update
      updateScrollVariables();

      // Update on scroll
      viewport.addEventListener('scroll', updateScrollVariables, {
        passive: true,
      });

      // Update on resize (content or viewport size changes)
      const resizeObserver = new ResizeObserver(updateScrollVariables);
      resizeObserver.observe(viewport);

      // …and on the CONTENT's own boxes, not just the viewport's. Content can
      // grow with no DOM mutation at all and without the viewport resizing: an
      // image finishing loading and taking its intrinsic height, a webfont
      // arriving and reflowing a paragraph, a height transition finishing. The
      // viewport is normally pinned by its layout, so none of that resizes it,
      // and none of it is a mutation either — yet each one is the fits-to-
      // overflows transition the tab stop is derived from, and missing it
      // leaves a scrollable region with no focusable descendants at
      // `tabIndex={-1}`, unreachable by keyboard.
      //
      // The direct children are enough: a block that grows deeper inside grows
      // its ancestors' boxes with it, and anything laid out so that it does not
      // (a fixed-height or absolutely-positioned child) does not change
      // `scrollHeight` either. The measurement writes only custom properties
      // the fade pseudo-elements read and a tabIndex, so observing them cannot
      // feed back into layout.
      const observedChildren = new Set<Element>();
      const syncChildObservers = () => {
        for (const child of observedChildren) {
          if (child.parentNode === viewport) continue;
          resizeObserver.unobserve(child);
          observedChildren.delete(child);
        }
        for (const child of viewport.children) {
          if (observedChildren.has(child)) continue;
          resizeObserver.observe(child);
          observedChildren.add(child);
        }
      };
      syncChildObservers();

      // The viewport's own box is usually pinned by its layout, so content
      // growing inside it — a tab panel swapped, validation errors appearing,
      // an async asset arriving — changes `scrollHeight` and resizes nothing.
      // That is exactly the fits-to-overflows transition the tab stop is
      // derived from, so it has to be watched directly.
      const mutationObserver = new MutationObserver(() => {
        syncChildObservers();
        updateScrollVariables();
      });
      mutationObserver.observe(viewport, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      return () => {
        viewport.removeEventListener('scroll', updateScrollVariables);
        resizeObserver.disconnect();
        mutationObserver.disconnect();
        observedChildren.clear();
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
        }
      };
    }, [updateScrollVariables]);

    useEffect(() => {
      updateScrollVariables();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [remeasureKey]);

    const getSnapClasses = () => {
      if (!snap) return null;
      const snapType =
        snap === 'mandatory' ? 'snap-mandatory' : 'snap-proximity';
      if (snapAxis === 'x') return `snap-x ${snapType}`;
      if (snapAxis === 'y') return `snap-y ${snapType}`;
      return `snap-both ${snapType}`;
    };

    const isHorizontal = orientation === 'horizontal';
    const resolvedTabIndex = tabIndex ?? (overflows ? 0 : -1);
    const isNamed = !nameWhenScrollableOnly || resolvedTabIndex >= 0;

    return (
      <div
        className={cx('relative isolate flex h-full min-h-0 flex-1', className)}
      >
        <section
          ref={useMergeRefs({ viewportRef, ref })}
          tabIndex={resolvedTabIndex}
          aria-label={isNamed ? ariaLabel : undefined}
          aria-labelledby={isNamed ? ariaLabelledBy : undefined}
          className={cx(
            'focusable',
            'py-2',
            // Layout
            isHorizontal
              ? 'min-w-0 flex-auto overflow-x-auto overflow-y-hidden'
              : 'min-h-0 flex-1 overflow-auto',
            // Gradient fade effect
            fade &&
              (isHorizontal
                ? 'scroll-area-viewport-x'
                : 'scroll-area-viewport'),
            // Scroll snap
            getSnapClasses(),
            viewportClassName,
          )}
          style={
            {
              '--scroll-area-overflow-y-start': '0px',
              '--scroll-area-overflow-y-end': '0px',
              '--scrollbar-width': '0px',
              '--scroll-area-overflow-x-start': '0px',
              '--scroll-area-overflow-x-end': '0px',
              '--scrollbar-height': '0px',
            } as CSSProperties
          }
          {...rest}
        >
          {children}
        </section>
      </div>
    );
  },
);

ScrollArea.displayName = 'ScrollArea';

export { ScrollArea, type ScrollAreaProps };
