'use client';

import { animate } from 'motion/react';
import { type RefObject, useLayoutEffect, useRef } from 'react';

import { useShouldSkipAnimations } from '@codaco/fresco-ui/hooks/useSafeAnimate';
import Spinner from '@codaco/fresco-ui/Spinner';

import { type CanvasStoreApi, useCanvasStore } from './useCanvasStore';

const REVEAL_SECONDS = 0.4;

/**
 * While the first automatic layout a canvas shows is computed, the canvas
 * shows only its background and a loading indicator: it marks itself
 * `aria-busy` and hides every direct child not marked `data-canvas-backdrop`.
 * Once the layout arrives, those children fade in together. Returns whether
 * the layout is still pending.
 */
export function useLayoutReveal(
  canvasRef: RefObject<HTMLElement | null>,
  store: CanvasStoreApi,
) {
  const pending = useCanvasStore(store, (state) => state.layoutPending);
  const skipAnimations = useShouldSkipAnimations();
  const wasPending = useRef(pending);

  // A layout effect, so the fade starts before the people just placed are
  // first painted.
  useLayoutEffect(() => {
    const revealed = wasPending.current && !pending;
    wasPending.current = pending;
    const canvas = canvasRef.current;
    if (!revealed || !canvas || skipAnimations) return undefined;
    const content = canvas.querySelectorAll(
      ':scope > :not([data-canvas-backdrop])',
    );
    if (content.length === 0) return undefined;
    const controls = animate(
      content,
      { opacity: [0, 1] },
      { duration: REVEAL_SECONDS, ease: 'easeOut' },
    );
    // Never leave the canvas part-faded.
    return () => controls.complete();
  }, [pending, canvasRef, skipAnimations]);

  return pending;
}

export function LayoutPendingIndicator() {
  return (
    <div
      data-canvas-backdrop
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <Spinner />
    </div>
  );
}
