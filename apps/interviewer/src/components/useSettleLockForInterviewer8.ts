import { useCallback } from 'react';

import { status } from '~/lib/auth/api';
import { useAuth } from '~/lib/auth/AuthContext';

import { useSetupWizard } from './SetupWizardDialog';

// The two Interviewers share one lock, and only this one can set it up:
// Interviewer 8 at `/v8/` only unlocks (and, hosted here, is handed this app's
// unlock), and while no lock has been set up it ends the interview at once.
// An installed app never runs unconfigured (AuthGate opens set-up first), but
// a browser tab does, so every way into a schema 8 interview asks `settleLock`
// before Interviewer 8 is hosted. With a lock (or
// the explicit choice of none) in place it answers at once; otherwise it opens
// the set-up wizard, and the page goes only once the researcher has chosen.
// Leaving the wizard leaves the device unconfigured, as it found it, and
// nothing is opened. Choosing the lock is a fresh authentication, so the way
// in asks for no step-up straight after it (`settled` says whether it will
// have to set up first).
export function useSettleLockForInterviewer8() {
  const { kind, refresh } = useAuth();
  // The data both apps already hold stays: set-up encrypts it rather than
  // starting afresh, and leaving set-up keeps the device as it was.
  const { openSetupWizard } = useSetupWizard({ preserveExistingData: true });
  const settled = kind !== 'unconfigured';

  const settleLock = useCallback(async (): Promise<boolean> => {
    if (kind !== 'unconfigured') return true;
    await openSetupWizard();
    let configured: boolean;
    try {
      ({ configured } = await status());
    } catch {
      return false;
    }
    if (configured) await refresh();
    return configured;
  }, [kind, openSetupWizard, refresh]);

  return { settled, settleLock };
}
