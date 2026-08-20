import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';

import { holdsFocus } from '@codaco/fresco-ui/utils/finalFocus';

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
 * link that the new route unmounts (every "Used In" link in the Codebook) drops
 * focus to `<body>`, and the next Tab restarts at the top of the document — the
 * header logo — instead of continuing into the page the researcher asked for.
 *
 * `holdsFocus` is fresco-ui's STATE predicate, and specifically not
 * `asFinalFocusTarget`. That one answers whether a node is usable as a focus
 * return DESTINATION, so it additionally requires an `HTMLElement` — Base UI's
 * `finalFocus` is typed to one — while an `<a>` or `tabindex` inside an inline
 * `<svg>` focuses as an `SVGElement`. Architect renders no such control today,
 * so the two agree on everything currently on screen; the point is that focus
 * sitting on one is still focus, and the destination predicate would call a
 * real focus owner "lost" and drag the researcher to the heading — exactly the
 * fighting-another-owner behaviour `focusRouteTarget` below rules out.
 * `RouteFocus.test.tsx` pins that case and fails if this is rewritten in terms
 * of the destination helper.
 */
const focusWasLost = () => !holdsFocus(document.activeElement);

/**
 * Lands focus on the current route's landing point, and returns it so the
 * caller can say where the researcher has been put.
 *
 * Deliberately narrow: focus only moves when the view change LOST focus. Any
 * other owner — a dialog that navigated and then returned focus to its opener,
 * the new-stage flow's autofocused name input, a persistent nav control — is
 * left alone, so this cannot fight `focusFirstError`, a modal's focus trap, or
 * a `finalFocus` target.
 *
 * Exported for the one other place a route's content is replaced without the
 * location changing: `ProtocolRouteGuard` swapping the read-only view back for
 * the editor when another tab releases the protocol lock. The effect below
 * cannot see that, so the guard calls this — and this is the single statement
 * of "land on the route heading, without fighting another owner".
 */
export const focusRouteTarget = () => {
  const target = document.querySelector<HTMLElement>(
    ROUTE_FOCUS_TARGET_SELECTOR,
  );
  if (!target) return null;

  if (!focusWasLost()) return target;
  // Base UI marks the rest of the document `inert` while a modal is open.
  // Focusing an inert element silently fails and leaves focus on `<body>` —
  // worse than not trying.
  if (target.closest('[inert]')) return target;

  // `preventScroll` so this does not fight ProjectLayout's scroll restoration,
  // which runs in a layout effect in the same commit — on the location change
  // when a route changes, and on mount when the guard swaps the layout out.
  target.focus({ preventScroll: true });
  return target;
};

/**
 * Route-change focus and announcement, mounted once above the router.
 *
 * The destination is announced on every route change, because a screen-reader
 * user gets no other signal that the page changed. Focus moves under the
 * narrower rule `focusRouteTarget` states.
 */
const RouteFocus = () => {
  const [location] = useLocation();
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
    const target = focusRouteTarget();
    if (!target) return;

    setDestination(target.textContent?.trim() ?? '');
  }, [location]);

  return (
    <div role="status" aria-live="polite" className="sr-only">
      {destination}
    </div>
  );
};

export default RouteFocus;
