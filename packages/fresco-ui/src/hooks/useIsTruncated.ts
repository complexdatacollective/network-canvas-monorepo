'use client';

import { type RefObject, useLayoutEffect, useRef, useState } from 'react';

type UseIsTruncatedOptions = {
  /** Primitive whose change forces a re-measure (e.g. the rendered text). */
  watch?: string | number | boolean | null;
  /** Skip measurement entirely (e.g. while the element isn't rendered). */
  enabled?: boolean;
};

/** Reports whether the element carrying `ref` visually truncates its content */
export function useIsTruncated<T extends HTMLElement = HTMLElement>({
  watch,
  enabled = true,
}: UseIsTruncatedOptions = {}): {
  ref: RefObject<T | null>;
  isTruncated: boolean;
} {
  const ref = useRef<T>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el) {
      setIsTruncated(false);
      return undefined;
    }

    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const next =
        el.scrollHeight - el.clientHeight > 1 ||
        el.scrollWidth - el.clientWidth > 1;
      setIsTruncated((prev) => (prev === next ? prev : next));
    };

    measure();

    void document.fonts?.ready.then(measure);

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        cancelled = true;
      };
    }

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [watch, enabled]);

  return { ref, isTruncated };
}
