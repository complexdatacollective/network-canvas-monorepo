import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';

import { useAuth } from './AuthContext';
import StepUpAuthDialog, { type StepUpResult } from './StepUpAuthDialog';

type StepUpAuthContextValue = {
  requireFreshUnlock: () => Promise<StepUpResult>;
  // The interview whose entry gate has already been satisfied in the current
  // unlock session. Lets InterviewRoute skip the enter gate when an idle-lock
  // /unlock cycle remounts the same interview — the user already authenticated
  // at the LockScreen, so a second step-up prompt would be redundant. Held in a
  // ref on this provider, which sits above AuthGate, so it survives the remount.
  getAuthorizedInterviewId: () => string | null;
  setAuthorizedInterviewId: (sessionId: string | null) => void;
};

const StepUpAuthContext = createContext<StepUpAuthContextValue | null>(null);

export function StepUpAuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { closeAllDialogs } = useDialog();
  const [open, setOpen] = useState(false);
  const pendingResolve = useRef<((r: StepUpResult) => void) | null>(null);
  const prevKind = useRef(auth.kind);

  const handleResolve = useCallback((result: StepUpResult) => {
    setOpen(false);
    const resolve = pendingResolve.current;
    pendingResolve.current = null;
    resolve?.(result);
  }, []);

  // The dialog providers sit above AuthGate so their state survives the
  // locked/unlocked child swap. A destructive confirm (delete-protocol,
  // revoke/reset-device) must not survive a lock boundary in either direction:
  // one opened before a lock mustn't resurface armed on unlock, and one the lock
  // screen itself opens (its Reset escape hatch) mustn't float over Home once
  // biometric auto-unlock resolves. So dismiss all provider-hosted dialogs on
  // both the →locked and locked→unlocked transitions, and cancel a pending
  // step-up on lock so its awaiting caller doesn't hang.
  useEffect(() => {
    const previous = prevKind.current;
    prevKind.current = auth.kind;

    if (auth.kind === 'locked') {
      const resolve = pendingResolve.current;
      if (resolve) {
        pendingResolve.current = null;
        setOpen(false);
        resolve({ ok: false, reason: 'cancelled' });
      }
      closeAllDialogs();
      return;
    }

    if (auth.kind === 'unlocked' && previous === 'locked') {
      closeAllDialogs();
    }
  }, [auth.kind, closeAllDialogs]);

  const requireFreshUnlock = useCallback(async (): Promise<StepUpResult> => {
    if (auth.kind !== 'unlocked' || !auth.mode || auth.mode === 'none') {
      return { ok: true };
    }
    return new Promise<StepUpResult>((resolve) => {
      pendingResolve.current = resolve;
      setOpen(true);
    });
  }, [auth.kind, auth.mode]);

  const authorizedInterviewId = useRef<string | null>(null);
  const getAuthorizedInterviewId = useCallback(
    () => authorizedInterviewId.current,
    [],
  );
  const setAuthorizedInterviewId = useCallback((sessionId: string | null) => {
    authorizedInterviewId.current = sessionId;
  }, []);

  return (
    <StepUpAuthContext.Provider
      value={{
        requireFreshUnlock,
        getAuthorizedInterviewId,
        setAuthorizedInterviewId,
      }}
    >
      {children}
      <StepUpAuthDialog open={open} onResolve={handleResolve} />
    </StepUpAuthContext.Provider>
  );
}

export function useStepUpAuth(): StepUpAuthContextValue {
  const ctx = useContext(StepUpAuthContext);
  if (!ctx) {
    throw new Error('useStepUpAuth must be used within StepUpAuthProvider');
  }
  return ctx;
}
