'use client';

import { type MotionValue, motionValue } from 'motion/react';
import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useState,
} from 'react';

// A section that needs the page to itself (a visualisation with its own
// colour, say) can ask the page background to step aside while it is in view.
// The background fades out as such a section scrolls in and back as it
// leaves, following the scroll position rather than a timer.

type PageBackgroundVisibility = {
  // 1 while the background shows, 0 while a section has it hidden.
  opacity: MotionValue<number>;
  hideWhileInView: (element: HTMLElement) => () => void;
};

const PageBackgroundVisibilityContext =
  createContext<PageBackgroundVisibility | null>(null);

// The share of the viewport an edge of the section crosses while the
// background fades: it is gone once the section's top is 40% of the way up the
// viewport, and starts to return once its bottom rises past 60% of the way
// down.
const FADE_SPAN = 0.6;

/** How fully a section hides the background (0–1), from its viewport box. */
export function sectionCoverage(
  top: number,
  bottom: number,
  viewportHeight: number,
) {
  const span = Math.max(1, viewportHeight * FADE_SPAN);
  const entered = (viewportHeight - top) / span;
  const remaining = bottom / span;
  return Math.min(1, Math.max(0, Math.min(entered, remaining)));
}

function createPageBackgroundVisibility(): PageBackgroundVisibility {
  const opacity = motionValue(1);
  const sections = new Set<HTMLElement>();
  let frame = 0;
  let stopListening: (() => void) | null = null;

  const update = () => {
    let hidden = 0;
    for (const section of sections) {
      const { top, bottom } = section.getBoundingClientRect();
      hidden = Math.max(
        hidden,
        sectionCoverage(top, bottom, window.innerHeight),
      );
    }
    opacity.set(1 - hidden);
  };

  // One measurement per frame, however many scroll events arrive.
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      update();
    });
  };

  const listen = () => {
    const observer = new ResizeObserver(schedule);
    observer.observe(document.documentElement);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  };

  return {
    opacity,
    hideWhileInView(section) {
      sections.add(section);
      stopListening ??= listen();
      update();
      return () => {
        sections.delete(section);
        if (sections.size === 0) {
          stopListening?.();
          stopListening = null;
        }
        update();
      };
    },
  };
}

export function PageBackgroundVisibilityProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [visibility] = useState(createPageBackgroundVisibility);
  return (
    <PageBackgroundVisibilityContext.Provider value={visibility}>
      {children}
    </PageBackgroundVisibilityContext.Provider>
  );
}

/**
 * Hides the page background while `ref`'s element is in view, unless
 * `enabled` is false.
 */
export function useHidePageBackground(
  ref: RefObject<HTMLElement | null>,
  enabled = true,
) {
  const visibility = useContext(PageBackgroundVisibilityContext);
  useEffect(() => {
    const section = ref.current;
    if (!enabled || !visibility || !section) return undefined;
    return visibility.hideWhileInView(section);
  }, [enabled, visibility, ref]);
}

/** The page background's opacity, or null outside a provider. */
export function usePageBackgroundOpacity() {
  return useContext(PageBackgroundVisibilityContext)?.opacity ?? null;
}
