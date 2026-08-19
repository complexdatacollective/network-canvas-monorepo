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
 * fighting-another-owner behaviour the component comment below rules out.
 * `RouteFocus.test.tsx` pins that case and fails if this is rewritten in terms
 * of the destination helper.
 */
const focusWasLost = () => !holdsFocus(document.activeElement);

/**
 * Route-change focus and announcement, mounted once above the router.
 *
 * Deliberately narrow: focus only moves when the navigation LOST focus. Any
 * other owner — a dialog that navigated and then returned focus to its opener,
 * the new-stage flow's autofocused name input, a persistent nav control — is
 * left alone, so this cannot fight `focusFirstError`, a modal's focus trap, or
 * a `finalFocus` target. The destination is announced on every route change,
 * because a screen-reader user gets no other signal that the page changed.
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

    const target = document.querySelector<HTMLElement>(
      ROUTE_FOCUS_TARGET_SELECTOR,
    );
    if (!target) return;

    setDestination(target.textContent?.trim() ?? '');

    if (!focusWasLost()) return;
    // Base UI marks the rest of the document `inert` while a modal is open.
    // Focusing an inert element silently fails and leaves focus on `<body>` —
    // worse than not trying.
    if (target.closest('[inert]')) return;

    // `preventScroll` so this does not fight ProjectLayout's scroll
    // restoration, which runs in a layout effect on the same location change.
    target.focus({ preventScroll: true });
  }, [location]);

  return (
    <div role="status" aria-live="polite" className="sr-only">
      {destination}
    </div>
  );
};

export default RouteFocus;
