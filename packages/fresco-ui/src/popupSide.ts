'use client';

import { useDirection } from '@base-ui/react/direction-provider';

/**
 * Where a popup opens beside its trigger. `inline-start` and `inline-end` are
 * the start and end of the line, so a popup opens on the same side as the text
 * in either writing direction; `left` and `right` stay where they are when the
 * interface mirrors, for a popup that means a physical side.
 */
export type PopupSide =
  | 'top'
  | 'bottom'
  | 'inline-start'
  | 'inline-end'
  | 'left'
  | 'right';

/**
 * The physical side for Base UI's positioner. Base UI accepts the logical
 * sides itself, but then reports them back as `data-side="inline-end"`, which
 * the arrow classes in `popoverArrow.ts` (placed by distances from the left
 * and the top)
 * cannot follow. Resolving the side here keeps every side the arrow sees a
 * physical one.
 */
export function usePhysicalSide(
  side: PopupSide | undefined,
): 'top' | 'bottom' | 'left' | 'right' | undefined {
  const rightToLeft = useDirection() === 'rtl';
  if (side === 'inline-start') return rightToLeft ? 'right' : 'left';
  if (side === 'inline-end') return rightToLeft ? 'left' : 'right';
  return side;
}
