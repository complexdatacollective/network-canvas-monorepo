import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import { useAppDispatch } from '~/ducks/hooks';
import { resetDraft } from '~/ducks/modules/stageEditorDraft';
import { useProtocolAccessMode } from '~/hooks/useProtocolAccessMode';

// Shown across the protocol editor when the same protocol is already open in
// another tab. Both tabs share one library row, so only the first tab edits it;
// this tab shows a read-only view of the protocol instead (see
// ProtocolRouteGuard). Non-blocking, so the protocol stays readable, with the
// thing that actually resolves the situation spelled out: closing the other tab
// releases the protocol, and this tab then reloads the saved copy and picks
// editing back up (see useProtocolTabLock).
//
// No "return to start screen" action here: the toolbar on the same page already
// carries one, and two controls with the same accessible name on one page is a
// worse experience for anyone navigating by name.
const ProtocolOpenElsewhereBanner = () => {
  const dispatch = useAppDispatch();
  const [, setLocation] = useLocation();
  const mode = useProtocolAccessMode();
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

  return (
    <Alert
      ref={bannerRef}
      tabIndex={-1}
      variant={readOnly ? 'info' : 'warning'}
      density="compact"
      className="border-outline my-0 shrink-0 rounded-none! border-x-0 border-t-0 border-b px-7 py-2.5 shadow-none!"
    >
      <AlertDescription className="flex items-center justify-between gap-5 text-sm">
        <span>
          {readOnly
            ? 'This protocol is open in another tab, which holds the saved copy. You are viewing it here in read-only mode. Close the other tab to continue editing in this one.'
            : 'This protocol has been opened in another tab, which now holds the saved copy. Nothing you change here can be saved, including any unsaved changes to this stage. Close the other tab to carry on editing here, or discard your changes to switch to a read-only view.'}
        </span>
        {readOnly ? null : (
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

export default ProtocolOpenElsewhereBanner;
