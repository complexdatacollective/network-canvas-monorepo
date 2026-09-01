import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import { useNestedEditorOpen } from '~/components/DialogForm/nestedDraftRegistry';
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
// Five situations, five whole messages (never assembled fragments, so they can
// be localised): another tab holds the protocol and this one is reading it;
// another tab holds it while a stage editor here still has the researcher's
// work in it; another tab holds it while some other editor here does; and, once
// the other tab has closed, either an outstanding choice about stage changes
// that cannot be combined with what it saved (StageDraftConflictDialog asks it)
// or an editor still open that has to be resolved before anything else can be
// (NestedDraftReclaimDialog). This banner is what remains on screen while
// either answer is pending.
//
// No "return to start screen" action here: the toolbar on the same page already
// carries one, and two controls with the same accessible name on one page is a
// worse experience for anyone navigating by name.
const ProtocolLockBanner = () => {
  const dispatch = useAppDispatch();
  const [, setLocation] = useLocation();
  const mode = useProtocolAccessMode();
  const lockState = useAppSelector(getProtocolLockState);
  const nestedEditorOpen = useNestedEditorOpen();
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

  if (
    mode !== 'read-only' &&
    mode !== 'held-stage-editor' &&
    mode !== 'held-nested-editor'
  ) {
    return null;
  }

  const readOnly = mode === 'read-only';
  const conflictPending = lockState === 'reclaim-blocked';
  // An open nested editor is what has to be resolved first — whether or not
  // anything has been typed into it, see `hasOpenNestedEditor` — so it decides
  // both what this says and which action goes with it.
  const nestedBlocking = conflictPending && nestedEditorOpen;

  // The conflict message leads, whatever the route: once the other tab has
  // closed, telling the researcher to close it would send them looking for a
  // tab that no longer exists.
  const message = nestedBlocking
    ? 'The other tab has been closed, but an editor is still open here. Nothing can be saved or loaded in this tab until you finish or cancel that editor.'
    : conflictPending
      ? 'The other tab has been closed, but your unsaved changes to this stage cannot be combined with the version it saved. Nothing can be saved here until you decide which to keep.'
      : readOnly
        ? 'This protocol is open in another tab, which holds the saved copy. You are viewing it here in read-only mode. Close the other tab to continue editing in this one.'
        : mode === 'held-nested-editor'
          ? 'This protocol has been opened in another tab, which now holds the saved copy. Nothing you change here can be saved, including any unsaved changes in the editor you have open. Close the other tab to carry on editing here, or close that editor to switch to a read-only view.'
          : 'This protocol has been opened in another tab, which now holds the saved copy. Nothing you change here can be saved, including any unsaved changes to this stage. Close the other tab to carry on editing here, or discard your changes to switch to a read-only view.';

  // What, if anything, belongs beside the message.
  //
  // Both outstanding questions can be dismissed without being answered — the
  // stage choice because nothing is written until it is, the open-editor
  // explanation because the editor it is about is on the screen behind it — so
  // the banner has to be able to put either one back.
  //
  // A held stage editor offers the discard that is its way to the read-only
  // view. A held NESTED editor offers nothing: what resolves it is finishing or
  // cancelling the editor already on screen, and a discard here would clear the
  // STAGE draft, which is not what the message is about. Read-only offers
  // nothing either — the toolbar already carries the only way out, and two
  // controls with one accessible name is worse for anyone navigating by name.
  const action = readOnly
    ? null
    : nestedBlocking
      ? {
          label: 'Show Me What to Do',
          onClick: () => dispatch(requestProtocolReclaimChoice()),
        }
      : conflictPending
        ? {
            label: 'Choose What to Keep',
            onClick: () => dispatch(requestProtocolReclaimChoice()),
          }
        : mode === 'held-nested-editor'
          ? null
          : {
              label: 'Discard Changes',
              onClick: () => {
                // Discarding leaves the stage editor as well as clearing the
                // draft: staying would leave an editor whose every control is
                // still live but whose writes can never be saved.
                dispatch(resetDraft(null));
                setLocation('/protocol');
              },
            };

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
        {action ? (
          <Button
            size="sm"
            color="warning"
            className="bg-warning-contrast text-warning shrink-0"
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
};

export default ProtocolLockBanner;
