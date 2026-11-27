'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type FocusWithin = Readonly<{
  /** Whether focus is in the element, or in anything that it opened. */
  focusWithin: boolean;
  /** Call from the element's `onFocus`. */
  onFocus: () => void;
  /** Call from the element's `onBlur`, with the event. */
  onBlur: (event: Readonly<{ relatedTarget: EventTarget | null }>) => void;
}>;

/**
 * Follows whether focus is within an element or within anything that it
 * opened over the page: a popover, a menu or a list drawn in a portal. It
 * listens to React's focus events, which reach the element from a portal
 * that it rendered even though the portal is elsewhere in the page.
 *
 * Focus moving between two places that count blurs one before it focuses the
 * other, so leaving is settled a task later: `onLeave` runs then, if focus
 * has not come back, and is given what focus went to (the blur's
 * `relatedTarget`). A dialog opened imperatively (`useDialog`) is not
 * rendered by the element, so its focus events do not reach it; `onLeave`
 * can recognise one by `next` and ignore it.
 *
 * ```tsx
 * const { focusWithin, onFocus, onBlur } = useFocusWithin(() => close());
 * <div onFocus={onFocus} onBlur={onBlur}>…</div>
 * ```
 */
export function useFocusWithin(
  onLeave?: (next: Element | null) => void,
): FocusWithin {
  const [focusWithin, setFocusWithin] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestOnLeave = useRef(onLeave);
  useEffect(() => {
    latestOnLeave.current = onLeave;
  });
  const cancel = useCallback(() => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);

  const onFocus = useCallback(() => {
    cancel();
    setFocusWithin(true);
  }, [cancel]);
  const onBlur = useCallback(
    ({ relatedTarget }: Readonly<{ relatedTarget: EventTarget | null }>) => {
      cancel();
      const next = relatedTarget instanceof Element ? relatedTarget : null;
      timer.current = setTimeout(() => {
        timer.current = null;
        setFocusWithin(false);
        latestOnLeave.current?.(next);
      }, 0);
    },
    [cancel],
  );

  return { focusWithin, onFocus, onBlur };
}
