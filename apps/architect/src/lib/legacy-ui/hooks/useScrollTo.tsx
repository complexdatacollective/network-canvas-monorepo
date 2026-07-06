import { type RefObject, useEffect, useRef } from 'react';

const scrollFocus = (
  destination: HTMLElement,
  delay = 0,
): NodeJS.Timeout | null => {
  if (!destination) {
    return null;
  }

  return setTimeout(() => {
    // `scrollIntoView` finds the scrollable ancestor natively; `start` aligns
    // the field to the top so its dropdown panels below have room to show.
    destination.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, delay);
};

/**
 * Automatically scroll to ref after conditions are met
 */
const useScrollTo = (
  ref: RefObject<HTMLElement | null>,
  condition: (...args: unknown[]) => boolean,
  watch: unknown[],
  delay = 0,
): void => {
  const timer = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    if (ref?.current && condition(...watch)) {
      clearTimeout(timer.current);
      timer.current = scrollFocus(ref.current, delay) ?? undefined;
    }
    return () => {
      clearTimeout(timer.current);
    };
  }, [ref, condition, delay, watch, ...watch]);
};

export default useScrollTo;
