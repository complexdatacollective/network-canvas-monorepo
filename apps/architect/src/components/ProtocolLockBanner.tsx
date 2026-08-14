import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import {
  getProtocolLockState,
  requestProtocolReclaimChoice,
} from '~/ducks/modules/app';
import { resetDraft } from '~/ducks/modules/stageEditorDraft';
import { useProtocolAccessMode } from '~/hooks/useProtocolAccessMode';

// Shown across the protocol editor whenever this tab does not own the saved
// copy of the open protocol. Both tabs share one library row, so only the tab
// holding the lock edits it; this tab shows a read-only view of the protocol
// instead (see ProtocolRouteGuard). Non-blocking, so the protocol stays
// readable, with the thing that actually resolves the situation spelled out.
//
// Three situations, three whole messages (never assembled fragments, so they
// can be localised): another tab holds the protocol and this one is reading it;
// another tab holds it while a stage editor here still has the researcher's
// work in it; and the other tab has since closed but this tab's stage changes
// cannot be combined with what it saved, so a choice is outstanding
// (StageDraftConflictDialog asks it — this banner is what remains on screen
// while the answer is pending).
//
// No "return to start screen" action here: the toolbar on the same page already
// carries one, and two controls with the same accessible name on one page is a
// worse experience for anyone navigating by name.
const ProtocolLockBanner = () => {
  const dispatch = useAppDispatch();
  const [, setLocation] = useLocation();
  const mode = useProtocolAccessMode();
  const lockState = useAppSelector(getProtocolLockState);
  const bannerRef = useRef<HTMLDivElement>(null);

  // Entering the read-only view replaces whatever the user was looking at, so
  // focus has to go somewhere deliberate rather than falling back to <body>.
  // The banner is the explanation of what just happened and sits above the new
  // content, so it takes focus; from there Tab reaches the page. Deliberately
  // not done for 'held-stage-editor', where nothing is replaced and the user
  // may be mid-keystroke.
  useEffect(() => {
    if (mode !== 'read-only') return;
    bannerRef.current?.focus();
  }, [mode]);

  if (mode !== 'read-only' && mode !== 'held-stage-editor') {
    return null;
  }

  const readOnly = mode === 'read-only';
  const conflictPending = lockState === 'reclaim-blocked';

  // The conflict message leads, whatever the route: once the other tab has
  // closed, telling the researcher to close it would send them looking for a
  // tab that no longer exists.
  const message = conflictPending
    ? 'The other tab has been closed, but your unsaved changes to this stage cannot be combined with the version it saved. Nothing can be saved here until you decide which to keep.'
    : readOnly
      ? 'This protocol is open in another tab, which holds the saved copy. You are viewing it here in read-only mode. Close the other tab to continue editing in this one.'
      : 'This protocol has been opened in another tab, which now holds the saved copy. Nothing you change here can be saved, including any unsaved changes to this stage. Close the other tab to carry on editing here, or discard your changes to switch to a read-only view.';

  return (
    <Alert
      ref={bannerRef}
      tabIndex={-1}
      variant={readOnly ? 'info' : 'warning'}
      density="compact"
      className="border-outline my-0 shrink-0 rounded-none! border-x-0 border-t-0 border-b px-7 py-2.5 shadow-none!"
    >
      <AlertDescription className="flex items-center justify-between gap-5 text-sm">
        <span>{message}</span>
        {readOnly ? null : conflictPending ? (
          // The choice can be dismissed without answering, so this is how the
          // researcher gets back to it — including to the download that is the
          // only way to keep the work.
          <Button
            size="sm"
            color="warning"
            className="bg-warning-contrast text-warning shrink-0"
            onClick={() => dispatch(requestProtocolReclaimChoice())}
          >
            Choose What to Keep
          </Button>
        ) : (
          <Button
            size="sm"
            color="warning"
            className="bg-warning-contrast text-warning shrink-0"
            onClick={() => {
              // Discarding leaves the stage editor as well as clearing the
              // draft: staying would leave an editor whose every control is
              // still live but whose writes can never be saved.
              dispatch(resetDraft(null));
              setLocation('/protocol');
            }}
          >
            Discard Changes
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
};

export default ProtocolLockBanner;
