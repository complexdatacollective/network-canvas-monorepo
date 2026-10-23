'use client';

import { type RefObject, useLayoutEffect, useState } from 'react';

type BinNodeSize = 'sm' | 'xs';

// A full-size node (`size-24`) plus the node list's `p-4` padding on both
// sides, in spacing units.
const FULL_SIZE_UNITS = 24 + 8;

const readSpacingUnit = (element: HTMLElement) => {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;visibility:hidden;font-size:var(--spacing-base,0.25rem);';
  element.appendChild(probe);
  const unit = Number.parseFloat(getComputedStyle(probe).fontSize);
  element.removeChild(probe);
  return Number.isFinite(unit) && unit > 0 ? unit : 4;
};

/**
 * Full-size nodes when they fit across the bin's narrow axis, small ones when
 * they do not. The bin's box is sized by the grid track alone, never by the
 * nodes inside it, so the size it picks cannot feed back.
 */
export const useBinNodeSize = (
  ref: RefObject<HTMLElement | null>,
  isPortrait: boolean,
): BinNodeSize => {
  const [size, setSize] = useState<BinNodeSize>('sm');

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const unit = readSpacingUnit(element);
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      // A box with no size has not been laid out, so there is nothing to fit.
      if (width === 0 && height === 0) return;
      const available = isPortrait ? height : width;
      setSize(available >= FULL_SIZE_UNITS * unit ? 'sm' : 'xs');
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, isPortrait]);

  return size;
};
