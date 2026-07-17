// The stage attaches its pointer/dblclick listeners natively on the stage
// element (role="application" can't carry JSX pointer props without tripping
// jsx-a11y), so they fire in the bubble phase *before* React's delegated
// synthetic handlers reach the document root. An overlay control's own React
// `onPointerDown` + `stopPropagation()` therefore runs too late to stop the
// stage from starting a gesture and capturing the pointer.
//
// To make interception deterministic regardless of listener registration order,
// each interactive overlay control tags itself with one of these data
// attributes and the stage's native handlers consult `isOverlayControlTarget`
// to yield to them. This is the single, consistent interception strategy — the
// controls no longer rely on stopPropagation to pre-empt the stage.
export const RESIZE_HANDLE_ATTR = 'data-resize-handle';
export const ZONE_PILL_ATTR = 'data-zone-pill';
export const INLINE_EDITOR_ATTR = 'data-inline-editor';

const OVERLAY_SELECTOR = `[${RESIZE_HANDLE_ATTR}],[${ZONE_PILL_ATTR}],[${INLINE_EDITOR_ATTR}]`;

// True when the event target is (or sits inside) an interactive overlay control
// the stage must not steal the gesture from.
export function isOverlayControlTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(OVERLAY_SELECTOR) !== null;
}
