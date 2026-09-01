import { useEffect, useRef, useState } from 'react';

import { holdsFocus } from '../utils/finalFocus';

/**
 * Marks the element a route change should land on — the route's own `<h1>`.
 *
 * Exactly one element carries it per route. Put it on the heading rather than
 * on the first control: landing in a text field starts an edit the researcher
 * did not ask for, and landing on the heading leaves the whole page ahead of
 * the next Tab.
 */
const ROUTE_FOCUS_TARGET_SELECTOR = '[data-route-focus-target]';

/** Spread onto a route's `<h1>` to make it that route's landing point. */
export const routeFocusTargetProps = {
  'tabIndex': -1,
  'data-route-focus-target': '',
} as const;

/**
 * Whether the route change left the document with nothing focused. Activating a
 * link that the new route unmounts (every "Used In" link in Architect's
 * Codebook) drops focus to `<body>`, and the next Tab restarts at the top of
 * the document — the header logo — instead of continuing into the page the
 * researcher asked for.
 *
 * `holdsFocus` is fresco-ui's STATE predicate, and specifically not
 * `asFinalFocusTarget`. That one answers whether a node is usable as a focus
 * return DESTINATION, so it additionally requires an `HTMLElement` — Base UI's
 * `finalFocus` is typed to one — while an `<a>` or `tabindex` inside an inline
 * `<svg>` focuses as an `SVGElement`. No host renders such a control today, so
 * the two agree on everything currently on screen; the point is that focus
 * sitting on one is still focus, and the destination predicate would call a
 * real focus owner "lost" and drag the researcher to the heading — exactly the
 * fighting-another-owner behaviour `focusRouteTarget` below rules out. This is
 * a published component, so a consumer can render one at any time.
 * `__tests__/RouteFocus.test.tsx` pins that case and fails if this is rewritten
 * in terms of the destination helper.
 */
const focusWasLost = (ownerDocument: Document) =>
  !holdsFocus(ownerDocument.activeElement);

/**
 * Lands focus on the current route's landing point, and returns it so the
 * caller can say where the researcher has been put.
 *
 * Deliberately narrow: focus only moves when the view change LOST focus. Any
 * other owner — a dialog that navigated and then returned focus to its opener,
 * an autofocused name input in a create flow, a persistent nav control — is
 * left alone, so this cannot fight `focusFirstError`, a modal's focus trap, or
 * a `finalFocus` target.
 *
 * Exported for the case where a route's content is replaced without the
 * location changing: Architect's `ProtocolRouteGuard` swaps the read-only view
 * back for the editor when another tab releases the protocol lock. The effect
 * below cannot see that, so the guard calls this — and this is the single
 * statement of "land on the route heading, without fighting another owner".
 *
 * `ownerDocument` is the document to search and to read the focus state from.
 * It defaults to the ambient `document`; pass one explicitly when the UI is
 * rendered into another one (a popped-out window, an iframe), where the
 * ambient `document` is a different document altogether and both the query and
 * the "is anything focused?" question would be answered about the wrong page.
 */
/**
 * Whether the current route has a landing point at all.
 *
 * Exported for callers that must decide whether a handoff to
 * `focusRouteTarget` is possible BEFORE giving up whatever focus they hold —
 * `NavDrawer` suppresses Base UI's restore-to-trigger only when this answers
 * yes, because suppressing it with nowhere to land leaves focus on `<body>`.
 */
export const hasRouteFocusTarget = (ownerDocument: Document = document) =>
  ownerDocument.querySelector(ROUTE_FOCUS_TARGET_SELECTOR) !== null;

export const focusRouteTarget = (ownerDocument: Document = document) => {
  const target = ownerDocument.querySelector<HTMLElement>(
    ROUTE_FOCUS_TARGET_SELECTOR,
  );
  if (!target) return null;

  if (!focusWasLost(ownerDocument)) return target;
  // Base UI marks the rest of the document `inert` while a modal is open.
  // Focusing an inert element silently fails and leaves focus on `<body>` —
  // worse than not trying.
  if (target.closest('[inert]')) return target;

  // `preventScroll` so this does not fight a host's scroll restoration, which
  // typically runs in a layout effect in the same commit — on the location
  // change when a route changes, and on mount when a guard swaps the layout
  // out.
  target.focus({ preventScroll: true });
  return target;
};

export type RouteFocusProps = {
  /**
   * The host router's current location. Router-agnostic on purpose: every
   * router spells its location hook differently, and a shared component that
   * called one would bind fresco-ui to that router. The host subscribes and
   * passes the value down — a change to this string is what "a route change
   * happened" means here.
   */
  location: string;
  /**
   * The document to search and to announce about, forwarded to
   * `focusRouteTarget`. Defaults to the ambient `document`; pass one when the
   * UI is rendered into another (a popped-out window, an iframe), where the
   * ambient document is a different page entirely.
   */
  ownerDocument?: Document;
};

/**
 * Route-change focus and announcement, mounted once above the router.
 *
 * The destination is announced on every route change, because a screen-reader
 * user gets no other signal that the page changed. Focus moves under the
 * narrower rule `focusRouteTarget` states.
 */
const RouteFocus = ({ location, ownerDocument }: RouteFocusProps) => {
  const lastLocation = useRef<string | null>(null);
  const [destination, setDestination] = useState('');

  useEffect(() => {
    const previous = lastLocation.current;
    lastLocation.current = location;
    // First render is an arrival, not a navigation: whatever the app focused
    // on boot keeps it.
    if (previous === null || previous === location) return;

    // The announcement is not conditional on focus having moved: the page
    // changed under the researcher either way.
    const target = focusRouteTarget(ownerDocument);
    if (!target) return;

    setDestination(target.textContent?.trim() ?? '');
  }, [location, ownerDocument]);

  return (
    <div role="status" aria-live="polite" className="sr-only">
      {destination}
    </div>
  );
};

export default RouteFocus;
