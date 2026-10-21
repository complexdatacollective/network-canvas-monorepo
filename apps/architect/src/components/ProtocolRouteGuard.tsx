import { type ReactNode, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { navigate } from 'wouter/use-browser-location';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useAccessibilityAnnouncements } from '@codaco/fresco-ui/dnd/useAccessibilityAnnouncements';
import { focusRouteTarget } from '~/components/RouteFocus';
import { useProtocolAccessMode } from '~/hooks/useProtocolAccessMode';
import { guardState, isProtocolPath } from '~/hooks/useProtocolNavGuard';
import { ProtocolReadOnlyContext } from '~/hooks/useProtocolReadOnly';

const chromeMessages = defineMessages({
  editingRestored: {
    id: 'architect.chrome.protocolRouteGuard.editingRestored',
    defaultMessage:
      'The other tab is no longer editing this protocol, so you can edit it here again.',
    description:
      'Screen-reader announcement made when a tab that was showing a protocol read-only, because another tab was editing it, becomes able to edit it.',
  },
});

type ProtocolRouteGuardProps = {
  children: ReactNode;
};

/**
 * The single enforcement point for "may this tab show the protocol?".
 *
 * Every `/protocol` route renders through here, so a route added later is
 * covered without being told to opt in.
 *
 * No protocol in the editing buffer (a bookmarked or typed `/protocol` URL, a
 * session whose canonical row is gone, an invalid-protocol reset) is gated:
 * every reducer under `activeProtocol` no-ops against a null present, so the
 * editor would accept input and drop all of it. The route goes home instead,
 * and renders nothing on the way.
 *
 * A protocol open in another tab is not gated here. Every page renders as it
 * would anywhere else, and the guard tells each one, through
 * `useProtocolReadOnly`, to offer no editing while the other tab owns the
 * saved copy. The researcher can look through the whole protocol, and is still
 * on the page they chose when editing comes back. ProtocolLockBanner explains
 * the situation; the persistence gate (`getProtocolOwnedHere`) drops any write
 * a page lets through.
 */
const ProtocolRouteGuard = ({ children }: ProtocolRouteGuardProps) => {
  const intl = useAppIntl();
  const [location] = useLocation();
  const mode = useProtocolAccessMode();
  const { closeAllDialogs } = useDialog();
  const { announce } = useAccessibilityAnnouncements();
  const onProtocolRoute = isProtocolPath(location);
  const blocked = onProtocolRoute && mode === 'no-protocol';

  // Both directions of the switch to read-only need something done at the
  // moment it happens, and both tell a transition from a first render by the
  // same remembered mode, so they share one effect.
  //
  // Entering read-only: imperative dialogs (`useDialog`) are portalled outside
  // the route tree, so the page going read-only would leave one on screen with
  // a confirm that writes into a protocol this tab no longer owns. Dismiss on
  // the transition only: on a first render already in read-only mode there is
  // nothing of this tab's to dismiss, and startup dialogs are not ours to
  // close.
  //
  // This does NOT cover the route-tree editor dialogs (a new variable, an
  // entity type, an array row): those are rendered by the routes themselves,
  // and `held-nested-editor` keeps them operable until the researcher closes
  // them. By the time this transition to read-only runs, none is open.
  //
  // Becoming editable again (the other tab let the protocol go, so this one
  // reclaimed it): the page stays where it is, and nothing on it moves, so the
  // only sign of the change is the banner going and controls coming back.
  // Announce it. ProtocolLockBanner took focus when read-only began, and a
  // stage editor re-opens for editing as a fresh editor, so either can leave
  // focus on `<body>` with a Tab that restarts at the header logo; land it on
  // the page's own heading then, as a navigation would. RouteFocus cannot do
  // it: its effect is keyed on the location, which this does not change.
  const previousMode = useRef(mode);
  useEffect(() => {
    const previous = previousMode.current;
    previousMode.current = mode;

    if (mode === 'read-only') {
      if (previous === 'read-only') return;
      closeAllDialogs();
      return;
    }

    if (previous !== 'read-only' || mode !== 'editable') return;
    announce(intl.formatMessage(chromeMessages.editingRestored));
    const focused = document.activeElement;
    if (!focused || focused === document.body) focusRouteTarget();
  }, [mode, closeAllDialogs, announce, intl]);

  useEffect(() => {
    if (!blocked) return;
    // A confirmed leave clears the active protocol before it collapses the
    // protocol history entries and navigates; redirecting into the middle of
    // that would fight it for the history stack.
    if (guardState.bypass) return;
    // The raw browser-location navigate, not `useLocation`'s setter: the
    // setter passes through the Router's aroundNav, which would raise the
    // leave-editor confirmation over a redirect the user never asked for.
    navigate('/', { replace: true });
  }, [blocked, location]);

  if (!onProtocolRoute) return <>{children}</>;
  if (mode === 'no-protocol') return null;
  return (
    <ProtocolReadOnlyContext value={mode === 'read-only'}>
      {children}
    </ProtocolReadOnlyContext>
  );
};

export default ProtocolRouteGuard;
