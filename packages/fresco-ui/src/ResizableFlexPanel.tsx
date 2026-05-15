'use client';

import { Children, forwardRef, type ReactNode, useId } from 'react';
import { useMergeRefs } from 'react-best-merge-refs';

import useResizablePanel from './hooks/useResizablePanel';
import { cx } from './utils/cva';

type Breakpoint = {
  /** Position of the breakpoint as a percentage (0–100) of the container's main axis. */
  value: number;
  /** Human-readable label for the breakpoint, used by assistive tech and tooling. */
  label: string;
};

type ResizableFlexPanelProps = {
  /**
   * Unique key used to persist the panel's size in `localStorage`.
   *
   * Two panels sharing the same `storageKey` will share the same persisted size,
   * so use a stable, distinct value per panel instance.
   */
  'storageKey': string;
  /**
   * Initial size of the first panel as a percentage (0–100) of the container's main axis.
   * Used when no persisted value exists for `storageKey`, and when the user double-clicks
   * the resize handle to reset.
   *
   * @default 30
   */
  'defaultBasis'?: number;
  /**
   * Minimum size of the first panel as a percentage (0–100). The user cannot drag
   * or keyboard-step below this value.
   *
   * @default 10
   */
  'min'?: number;
  /**
   * Maximum size of the first panel as a percentage (0–100). The user cannot drag
   * or keyboard-step above this value.
   *
   * @default 90
   */
  'max'?: number;
  /**
   * Optional list of snap points. When provided, dragging snaps to the nearest
   * breakpoint and `PageUp`/`PageDown` (plus arrow keys) step between adjacent
   * breakpoints instead of using `keyboardStep`.
   *
   * @default []
   */
  'breakpoints'?: Breakpoint[];

  /**
   * Axis along which the panels are arranged and resized.
   * - `"horizontal"`: panels sit side-by-side; the handle resizes width.
   * - `"vertical"`: panels stack; the handle resizes height.
   *
   * @default "horizontal"
   */
  'orientation'?: 'horizontal' | 'vertical';
  /**
   * Percentage points to move per arrow-key press when no `breakpoints` are set.
   *
   * @default 2
   */
  'keyboardStep'?: number;
  /**
   * Controlled override of the panel size as a percentage (0–100). When defined,
   * the panel renders at this value, animates between changes, and the resize
   * handle is hidden / non-interactive. The persisted size is preserved and
   * restored when this prop becomes `undefined` again.
   */
  'overrideBasis'?: number;
  /**
   * Exactly two children, rendered as the first and second panels respectively.
   */
  'children': [ReactNode, ReactNode];
  /** Additional class names applied to the outer flex container. */
  'className'?: string;
  /**
   * Accessible label for the resize handle, announced by screen readers.
   *
   * @default "Resize panels"
   */
  'aria-label'?: string;
};

/**
 * A two-pane container with a draggable, keyboard-accessible handle that resizes
 * the first pane. The size is persisted to `localStorage` under `storageKey`, and
 * the second pane fills the remaining space.
 *
 * The handle is exposed as a slider to assistive tech: arrow keys step by
 * `keyboardStep` (or between `breakpoints` when provided), `Home`/`End` jump to
 * `min`/`max`, and `PageUp`/`PageDown` step between breakpoints. Double-clicking
 * the handle resets to `defaultBasis`.
 *
 * Pass `overrideBasis` to take temporary control of the size (e.g. to collapse
 * the panel); the handle hides while controlled and the persisted size is
 * restored when `overrideBasis` becomes `undefined`.
 *
 * @example
 * ```tsx
 * <ResizableFlexPanel storageKey="sidebar" defaultBasis={25} min={15} max={50}>
 *   <Sidebar />
 *   <MainContent />
 * </ResizableFlexPanel>
 * ```
 */
const ResizableFlexPanel = forwardRef<HTMLDivElement, ResizableFlexPanelProps>(
  (
    {
      storageKey,
      defaultBasis = 30,
      min = 10,
      max = 90,
      breakpoints = [],
      orientation = 'horizontal',
      keyboardStep = 2,
      overrideBasis,
      children,
      className,
      'aria-label': ariaLabel,
    },
    forwardedRef,
  ) => {
    const { basis, isDragging, containerRef, handleProps } = useResizablePanel({
      storageKey,
      defaultBasis,
      min,
      max,
      breakpoints,
      orientation,
      keyboardStep,
    });

    const mergedRef = useMergeRefs({ containerRef, forwardedRef });

    const activeBasis = overrideBasis ?? basis;
    const isOverridden = overrideBasis !== undefined;
    const isHorizontal = orientation === 'horizontal';

    const [firstChild, secondChild] = Children.toArray(children);

    const baseId = useId();
    const firstPanelId = `${baseId}-panel-1`;
    const secondPanelId = `${baseId}-panel-2`;

    return (
      <div
        ref={mergedRef}
        className={cx(
          'flex',
          isHorizontal ? 'flex-row' : 'flex-col',
          isDragging && 'cursor-col-resize select-none',
          !isHorizontal && isDragging && 'cursor-row-resize',
          className,
        )}
      >
        {/* First panel */}
        <div
          id={firstPanelId}
          className={cx(
            'flex shrink-0 flex-col',
            isOverridden &&
              'transition-[flex-basis] duration-(--animation-duration-standard) ease-(--animation-easing)',
            overrideBasis === 0 && 'overflow-hidden', // prevents content from preventing collapse when overridden to 0
          )}
          style={{
            flexBasis: `${activeBasis}%`,
            flexGrow: 0,
          }}
        >
          {firstChild}
        </div>

        {/* Resize handle — uses role="slider" because the user adjusts a
				    value (panel split %) within a range, which matches the slider
				    pattern and exposes the same aria-value* properties to AT. */}
        <button
          type="button"
          role="slider"
          aria-orientation={orientation}
          aria-valuenow={Math.round(activeBasis)}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-controls={`${firstPanelId} ${secondPanelId}`}
          aria-label={ariaLabel ?? 'Resize panels'}
          className={cx(
            'group',
            'focusable relative z-10 flex shrink-0 items-center justify-center',
            'touch-none border-0 bg-transparent p-0 select-none',
            isHorizontal ? 'w-4 cursor-col-resize' : 'h-4 cursor-row-resize',
            isOverridden && 'pointer-events-none hidden opacity-0',
            'transition-opacity duration-(--animation-duration-standard) ease-(--animation-easing)',
          )}
          {...handleProps}
        >
          {/* Visual grip indicator */}
          <span
            className={cx(
              'block rounded-full bg-white/30',
              'spring-[0.5,0.6]',
              'ease-in-out',
              'transition-[background-color,transform] duration-150',
              isHorizontal ? 'h-8 w-1' : 'h-1 w-8',
              isDragging && 'scale-150 bg-white/70',
              !isDragging &&
                !isOverridden &&
                'group-hover:bg-white/50 hover:scale-125 hover:bg-white/50',
            )}
          />
        </button>

        {/* Second panel */}
        <div
          id={secondPanelId}
          className={cx('flex min-h-0 min-w-0 flex-1 flex-col')}
        >
          {secondChild}
        </div>
      </div>
    );
  },
);

ResizableFlexPanel.displayName = 'ResizableFlexPanel';

export { ResizableFlexPanel };
