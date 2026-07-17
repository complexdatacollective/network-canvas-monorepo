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

const AUTHORIZED_INTERVIEW_ID_STORAGE_KEY =
  'interviewer:authorized-interview-id';

function readAuthorizedInterviewId(): string | null {
  try {
    return window.sessionStorage.getItem(AUTHORIZED_INTERVIEW_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistAuthorizedInterviewId(sessionId: string | null) {
  try {
    if (sessionId === null) {
      window.sessionStorage.removeItem(AUTHORIZED_INTERVIEW_ID_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(
        AUTHORIZED_INTERVIEW_ID_STORAGE_KEY,
        sessionId,
      );
    }
  } catch {
    // The in-memory authorization still works if storage is unavailable.
  }
}

type StepUpAuthContextValue = {
  requireFreshUnlock: () => Promise<StepUpResult>;
  // The interview whose entry gate has already been satisfied in this tab.
  // Lets InterviewRoute skip the enter gate when a lock/unlock cycle or hard
  // refresh remounts the same interview — Welcome back already authenticated
  // the user, so a second step-up prompt would be redundant.
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
  const authorizedInterviewId = useRef<string | null>(
    readAuthorizedInterviewId(),
  );
  const getAuthorizedInterviewId = useCallback(
    () => authorizedInterviewId.current,
    [],
  );
  const setAuthorizedInterviewId = useCallback((sessionId: string | null) => {
    authorizedInterviewId.current = sessionId;
    persistAuthorizedInterviewId(sessionId);
  }, []);

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
  // every auth-gate transition, and cancel a pending step-up whenever the app
  // leaves the unlocked state so its awaiting caller doesn't hang (including
  // when destructive recovery resets auth to unconfigured).
  useEffect(() => {
    const previous = prevKind.current;
    prevKind.current = auth.kind;

    if (auth.kind === 'unconfigured' || auth.kind === 'corrupt') {
      setAuthorizedInterviewId(null);
    }

    if (auth.kind !== 'unlocked') {
      const resolve = pendingResolve.current;
      if (resolve) {
        pendingResolve.current = null;
        setOpen(false);
        resolve({ ok: false, reason: 'cancelled' });
      }
      closeAllDialogs();
      return;
    }

    if (previous !== 'unlocked') {
      closeAllDialogs();
    }
  }, [auth.kind, closeAllDialogs, setAuthorizedInterviewId]);

  const requireFreshUnlock = useCallback(async (): Promise<StepUpResult> => {
    if (auth.kind !== 'unlocked' || !auth.mode || auth.mode === 'none') {
      return { ok: true };
    }
    return new Promise<StepUpResult>((resolve) => {
      pendingResolve.current = resolve;
      setOpen(true);
    });
  }, [auth.kind, auth.mode]);

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
