import type { Vec } from '~/model/types';
import { clamp01 } from '~/state/documentGeometry';

// Minimal pointer-event shape both React synthetic events and native
// PointerEvents satisfy, so the same gesture helper serves overlay controls
// (React onPointerDown) and the imperatively-listened stage.
export type GesturePointer = {
  button: number;
  pointerId: number;
  clientX: number;
  clientY: number;
};

// Local reimplementation of the interview package's useCanvasDrag idiom
// (packages/interview/src/canvas/useCanvasDrag.ts): pointer capture, a 5px
// threshold that distinguishes a click from a drag, and rAF-batched moves. That
// hook is not exported and is coupled to the interview canvas store, so the
// small amount of shared behaviour is reproduced here.

const DRAG_THRESHOLD = 5;

export function clientToNormalized(
  rect: DOMRect,
  clientX: number,
  clientY: number,
): Vec {
  if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}

export type PointerGestureHandlers = {
  onStart?: (start: Vec) => void;
  /**
   * Called (rAF-batched) once the pointer moves past the drag threshold.
   * `shiftKey` and `altKey` are read live from the move event so draws/resizes
   * can constrain to regular shapes and 45° lines while Shift is held, and any
   * gesture can bypass snapping while Alt is held.
   */
  onDrag?: (
    current: Vec,
    start: Vec,
    shiftKey: boolean,
    altKey: boolean,
  ) => void;
  /** Called on pointer up/cancel. `moved` is false for a click (never dragged). */
  onEnd?: (result: {
    moved: boolean;
    cancelled: boolean;
    end: Vec;
    start: Vec;
  }) => void;
};

// Begins a pointer gesture from a pointerdown. Captures the pointer on `target`
// and drives document-level move/up listeners until release.
export function startPointerGesture(
  e: GesturePointer,
  target: Element,
  getRect: () => DOMRect | null,
  handlers: PointerGestureHandlers,
): void {
  if (e.button !== 0) return;
  const rect = getRect();
  if (!rect) return;

  const pointerId = e.pointerId;
  const startClient = { x: e.clientX, y: e.clientY };
  const start = clientToNormalized(rect, e.clientX, e.clientY);
  let dragging = false;
  let raf: number | null = null;

  try {
    target.setPointerCapture(pointerId);
  } catch {
    // Pointer capture is a progressive enhancement; ignore if unavailable.
  }
  handlers.onStart?.(start);

  const currentPoint = (ev: PointerEvent): Vec => {
    const r = getRect();
    return r ? clientToNormalized(r, ev.clientX, ev.clientY) : start;
  };

  const onMove = (ev: PointerEvent) => {
    if (!dragging) {
      const dx = ev.clientX - startClient.x;
      const dy = ev.clientY - startClient.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      dragging = true;
    }
    if (raf !== null) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      handlers.onDrag?.(currentPoint(ev), start, ev.shiftKey, ev.altKey);
      raf = null;
    });
  };

  const finish = (ev: PointerEvent, cancelled: boolean) => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
    if (raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
    try {
      target.releasePointerCapture(pointerId);
    } catch {
      // Already released.
    }
    handlers.onEnd?.({
      moved: dragging,
      cancelled,
      end: currentPoint(ev),
      start,
    });
  };

  const onUp = (ev: PointerEvent) => finish(ev, false);
  const onCancel = (ev: PointerEvent) => finish(ev, true);

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onCancel);
}
