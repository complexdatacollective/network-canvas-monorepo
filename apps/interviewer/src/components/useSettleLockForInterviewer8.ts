import { useCallback } from 'react';

import { status } from '~/lib/auth/api';
import { useAuth } from '~/lib/auth/AuthContext';

import { useSetupWizard } from './SetupWizardDialog';

// The two Interviewers share one lock, and only this one can set it up:
// Interviewer 8 at `/v8/` only unlocks, and while no lock has been set up it
// sends the researcher straight back here. An installed app never runs
// unconfigured (AuthGate opens set-up first), but a browser tab does, so every
// way into Interviewer 8 asks `settleLock` before it leaves. With a lock (or
// the explicit choice of none) in place it answers at once; otherwise it opens
// the set-up wizard, and the page goes only once the researcher has chosen.
// Leaving the wizard leaves the device unconfigured, as it found it, and
// nothing is opened.
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
