'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { z } from 'zod/mini';

import useSafeLocalStorage from './useSafeLocalStorage';

type Breakpoint = {
  value: number;
  label: string;
};

type UseResizablePanelOptions = {
  storageKey: string;
  defaultBasis: number;
  min: number;
  max: number;
  /**
   * Hard minimum size of the first panel in pixels along the main axis. When
   * set, the effective minimum is the larger of `min` (%) and this value
   * converted to a percentage of the live container size, so the panel can
   * never be dragged narrower than its content requires regardless of the
   * container's width.
   */
  minSizePx?: number;
  breakpoints?: Breakpoint[];
  orientation?: 'horizontal' | 'vertical';
  keyboardStep?: number;
};

const basisSchema = z.number().check(z.minimum(0)).check(z.maximum(100));

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Resolve the effective minimum panel size as a percentage: the larger of the
 * `min` percentage and `minSizePx` expressed as a percentage of `containerSize`
 * (clamped to `max`). Falls back to `min` when there is no pixel floor or the
 * container has not been measured yet.
 */
export function getEffectiveMinPercent(
  min: number,
  max: number,
  minSizePx: number | undefined,
  containerSize: number,
): number {
  if (!minSizePx || containerSize <= 0) {
    return min;
  }
  return clamp(Math.max(min, (minSizePx / containerSize) * 100), 0, max);
}

function nearestBreakpoint(value: number, breakpoints: Breakpoint[]) {
  let closest: Breakpoint | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const bp of breakpoints) {
    const distance = Math.abs(value - bp.value);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = bp;
    }
  }

  return closest?.value ?? value;
}

export default function useResizablePanel({
  storageKey,
  defaultBasis,
  min,
  max,
  minSizePx,
  breakpoints = [],
  orientation = 'horizontal',
  keyboardStep = 2,
}: UseResizablePanelOptions) {
  const hasBreakpoints = breakpoints.length > 0;
  const sortedBreakpoints = useMemo(
    () =>
      hasBreakpoints
        ? [...breakpoints].toSorted((a, b) => a.value - b.value)
        : [],
    [hasBreakpoints, breakpoints],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [persistedBasis, setPersistedBasis] = useSafeLocalStorage(
    `resizable-panel-${storageKey}`,
    basisSchema,
    defaultBasis,
  );

  // The effective minimum is the larger of the `min` percentage and the
  // `minSizePx` floor expressed as a percentage of the current container size.
  const getEffectiveMin = useCallback(() => {
    const container = containerRef.current;
    const rect = container?.getBoundingClientRect();
    const size = rect
      ? orientation === 'horizontal'
        ? rect.width
        : rect.height
      : 0;
    return getEffectiveMinPercent(min, max, minSizePx, size);
  }, [min, max, minSizePx, orientation]);

  const setBasis = useCallback(
    (value: number) => {
      const clamped = clamp(value, getEffectiveMin(), max);
      setPersistedBasis(clamped);
    },
    [getEffectiveMin, max, setPersistedBasis],
  );

  const getPercentFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return persistedBasis;

      const rect = container.getBoundingClientRect();
      const isHorizontal = orientation === 'horizontal';
      const pos = isHorizontal ? clientX - rect.left : clientY - rect.top;
      const size = isHorizontal ? rect.width : rect.height;

      if (size === 0) return persistedBasis;
      return (pos / size) * 100;
    },
    [orientation, persistedBasis],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsDragging(true);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!isDragging) return;

      const rawPercent = getPercentFromPointer(e.clientX, e.clientY);
      const value = hasBreakpoints
        ? nearestBreakpoint(rawPercent, breakpoints)
        : rawPercent;
      setBasis(value);
    },
    [isDragging, getPercentFromPointer, hasBreakpoints, breakpoints, setBasis],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    setBasis(defaultBasis);
  }, [defaultBasis, setBasis]);

  const stepToAdjacentBreakpoint = useCallback(
    (direction: 'increase' | 'decrease') => {
      const prev = sortedBreakpoints
        .filter((bp) => bp.value < persistedBasis)
        .pop();
      const next = sortedBreakpoints.find((bp) => bp.value > persistedBasis);

      if (direction === 'increase') {
        setBasis(next ? next.value : (sortedBreakpoints.at(-1)?.value ?? max));
      } else {
        setBasis(prev ? prev.value : (sortedBreakpoints[0]?.value ?? min));
      }
    },
    [sortedBreakpoints, persistedBasis, setBasis, min, max],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const isHorizontal = orientation === 'horizontal';
      const increaseKey = isHorizontal ? 'ArrowRight' : 'ArrowDown';
      const decreaseKey = isHorizontal ? 'ArrowLeft' : 'ArrowUp';

      switch (e.key) {
        case increaseKey:
          e.preventDefault();
          if (hasBreakpoints) {
            stepToAdjacentBreakpoint('increase');
          } else {
            setBasis(persistedBasis + keyboardStep);
          }
          break;
        case decreaseKey:
          e.preventDefault();
          if (hasBreakpoints) {
            stepToAdjacentBreakpoint('decrease');
          } else {
            setBasis(persistedBasis - keyboardStep);
          }
          break;
        case 'Home':
          e.preventDefault();
          setBasis(hasBreakpoints ? (sortedBreakpoints[0]?.value ?? min) : min);
          break;
        case 'End':
          e.preventDefault();
          setBasis(
            hasBreakpoints ? (sortedBreakpoints.at(-1)?.value ?? max) : max,
          );
          break;
        case 'PageUp': {
          e.preventDefault();
          stepToAdjacentBreakpoint('decrease');
          break;
        }
        case 'PageDown': {
          e.preventDefault();
          stepToAdjacentBreakpoint('increase');
          break;
        }
      }
    },
    [
      orientation,
      persistedBasis,
      keyboardStep,
      hasBreakpoints,
      sortedBreakpoints,
      stepToAdjacentBreakpoint,
      min,
      max,
      setBasis,
    ],
  );

  return {
    basis: persistedBasis,
    isDragging,
    containerRef,
    handleProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onDoubleClick: handleDoubleClick,
      onKeyDown: handleKeyDown,
    },
  };
}
