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
 * What each of the two live regions is holding.
 *
 * A screen reader announces a live region when its content CHANGES, so a
 * destination that reads the same as the one before it — two protocols with a
 * "Name people" stage, two stages of one protocol sharing a title — would
 * write the same string into the same region, React would bail out of the
 * re-render, the DOM would never mutate and nothing would be announced. The
 * researcher gets no other signal that the page changed.
 *
 * Alternating between two regions makes the announcement a mutation
 * unconditionally: each navigation writes into whichever region is empty and
 * empties the other, so the pair changes whatever the text is. Encoding a
 * counter into the text instead would be read out to the researcher.
 */
type Announcements = readonly [string, string];

/** Both regions empty: nothing has been announced, or nothing is to be. */
const SILENT: Announcements = ['', ''];

/**
 * Route-change focus and announcement, mounted once above the router.
 *
 * The destination is announced on every route change, because a screen-reader
 * user gets no other signal that the page changed. Focus moves under the
 * narrower rule `focusRouteTarget` states.
 */
const RouteFocus = ({ location, ownerDocument }: RouteFocusProps) => {
  const lastLocation = useRef<string | null>(null);
  const [announcements, setAnnouncements] = useState<Announcements>(SILENT);

  useEffect(() => {
    const previous = lastLocation.current;
    lastLocation.current = location;
    // First render is an arrival, not a navigation: whatever the app focused
    // on boot keeps it.
    if (previous === null || previous === location) return undefined;

    const scope = ownerDocument ?? document;

    /**
     * Lands on the new route and says where the researcher was put, or reports
     * that the route has no landing point yet.
     *
     * The announcement is not conditional on focus having moved: the page
     * changed under the researcher either way.
     */
    const land = () => {
      const target = focusRouteTarget(scope);
      if (!target) return false;

      const destination = target.textContent?.trim() ?? '';
      setAnnouncements(([first]): Announcements =>
        first === '' ? [destination, ''] : ['', destination],
      );
      return true;
    };

    if (land()) return undefined;

    // A route with no landing point has no name to announce — there is no
    // heading to take one from, and inventing one would announce something the
    // page does not say. What it must NOT do is stay quiet and leave the
    // regions holding the PREVIOUS route's title, which tells a screen reader
    // the researcher is on a page they have already left.
    setAnnouncements(SILENT);

    // …or the landing point simply is not here YET. A lazy or Suspense-backed
    // route commits the location while it still shows a fallback, so this
    // effect runs before the heading exists — and nothing changes the location
    // afterwards, so without this it would never run again: focus would stay
    // parked wherever the navigation left it and the page change would never
    // be announced.
    //
    // Arriving late cannot take focus from anyone: `focusRouteTarget` moves it
    // only when the navigation left nothing focused, so a researcher who has
    // started using the fallback keeps what they are on. It still announces,
    // because the page did change.
    //
    // Bounded by the first success, by the next route change and by unmount
    // (both through the cleanup below), so at most one observer is watching at
    // a time and only while the current route has nothing to land on. Built
    // from the observed document's own realm where it has one, for the same
    // reason this component takes an `ownerDocument` at all.
    const view = scope.defaultView ?? window;
    const observer = new view.MutationObserver(() => {
      if (land()) observer.disconnect();
    });
    observer.observe(scope, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [location, ownerDocument]);

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {announcements[0]}
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {announcements[1]}
      </div>
    </>
  );
};

export default RouteFocus;
