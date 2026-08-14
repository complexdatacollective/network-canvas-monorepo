import { type ReactNode, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { navigate } from 'wouter/use-browser-location';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import SummaryPage from '~/components/pages/SummaryPage';
import ProjectLayout from '~/components/ProjectNav/ProjectLayout';
import { useProtocolAccessMode } from '~/hooks/useProtocolAccessMode';
import { guardState, isProtocolPath } from '~/hooks/useProtocolNavGuard';

// The whole-protocol read-only surface a non-exclusive tab gets in place of the
// editor. `/protocol/summary` already renders every part of a protocol (cover,
// contents, stages, codebook, resources) without a single mutating control, so
// a collision tab reuses it rather than growing a parallel "disabled editor"
// mode that the next control added would silently regress.
//
// It renders at whatever `/protocol` URL the user is on: taking the lock away
// should not also move them, and when the other tab closes this tab reclaims
// the lock and the route they asked for renders in place.
const ProtocolReadOnlyView = () => (
  <ProjectLayout>
    <SummaryPage />
  </ProjectLayout>
);

type ProtocolRouteGuardProps = {
  children: ReactNode;
};

/**
 * The single enforcement point for "may this tab edit the protocol?".
 *
 * Every `/protocol` route renders through here, so a route added later is
 * covered without being told to opt in. Two states are gated:
 *
 * - No protocol in the editing buffer (a bookmarked or typed `/protocol` URL, a
 *   session whose canonical row is gone, an invalid-protocol reset). Every
 *   reducer under `activeProtocol` no-ops against a null present, so the editor
 *   would accept input and drop all of it. The route goes home instead, and
 *   renders nothing on the way.
 * - The protocol is open in another tab, which owns the saved copy. The editor
 *   is replaced by the read-only view, so no control here can accept an edit
 *   that would never be written.
 */
const ProtocolRouteGuard = ({ children }: ProtocolRouteGuardProps) => {
  const [location] = useLocation();
  const mode = useProtocolAccessMode();
  const { closeAllDialogs } = useDialog();
  const onProtocolRoute = isProtocolPath(location);
  const blocked = onProtocolRoute && mode === 'no-protocol';

  // An editor dialog (a new variable, an entity type, a field) can be open at
  // the moment this tab loses the lock, and dialogs are portalled outside the
  // route tree, so replacing the editor would leave it on screen with a confirm
  // that writes into a protocol this tab no longer owns. Dismiss on the
  // transition only: on a first render already in read-only mode there is
  // nothing of this tab's to dismiss, and startup dialogs are not ours to
  // close.
  const previousMode = useRef(mode);
  useEffect(() => {
    const previous = previousMode.current;
    previousMode.current = mode;
    if (mode !== 'read-only' || previous === 'read-only') return;
    closeAllDialogs();
  }, [mode, closeAllDialogs]);

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
  if (mode === 'read-only') return <ProtocolReadOnlyView />;
  // 'held-stage-editor' keeps the editor mounted on purpose: a stage draft
  // exists nowhere else, so replacing the editor underneath it would be the
  // silent discard this guard exists to prevent. ProtocolLockBanner
  // explains that changes cannot be saved here and offers the ways out, and
  // the commit is refused (StageEditorNav, StageEditor.onSubmit).
  return <>{children}</>;
};

export default ProtocolRouteGuard;
