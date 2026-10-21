import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useRoute } from 'wouter';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';

import { useAuth } from './AuthContext';
import {
  clearInterviewRecoveryRestriction,
  isInterviewRoutePath,
} from './interviewRecoveryRestriction';
import StepUpAuthDialog, { type StepUpResult } from './StepUpAuthDialog';

type StepUpAuthContextValue = {
  requireFreshUnlock: () => Promise<StepUpResult>;
  // The interview whose entry gate has already been satisfied in this unlock
  // session. Lets InterviewRoute skip the enter gate when a lock/unlock cycle
  // or hard refresh remounts the same interview — the lock screen has just
  // authenticated the user, so a second step-up prompt would be redundant.
  // Held in memory only: a value read back from browser storage would let
  // anyone who can write that storage choose which interview skips the gate.
  getAuthorizedInterviewId: () => string | null;
  setAuthorizedInterviewId: (sessionId: string | null) => void;
};

const StepUpAuthContext = createContext<StepUpAuthContextValue | null>(null);

export function StepUpAuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { closeAllDialogs } = useDialog();
  const [location] = useLocation();
  const [onInterviewRoute, interviewRouteParams] = useRoute(
    '/interview/:sessionId',
  );
  const routedInterviewId = onInterviewRoute
    ? interviewRouteParams.sessionId
    : null;
  const [open, setOpen] = useState(false);
  const [allowDestructiveRecovery, setAllowDestructiveRecovery] =
    useState(true);
  const pendingResolve = useRef<((r: StepUpResult) => void) | null>(null);
  const prevKind = useRef(auth.kind);
  const authorizedInterviewId = useRef<string | null>(null);
  const kindAtLastAuthorizationCheck = useRef(auth.kind);
  const getAuthorizedInterviewId = useCallback(
    () => authorizedInterviewId.current,
    [],
  );
  const setAuthorizedInterviewId = useCallback((sessionId: string | null) => {
    authorizedInterviewId.current = sessionId;
  }, []);

  // Unlocking at the lock screen is a fresh authentication. When it happens
  // on an interview's route — an idle lock inside the interview, or a hard
  // refresh of it (a secured vault always starts locked) — it satisfies that
  // interview's entry gate. A layout effect, so the authorization is in place
  // before the interview route that mounts in the same commit runs its
  // (passive) enter-gate effect.
  useLayoutEffect(() => {
    const previous = kindAtLastAuthorizationCheck.current;
    kindAtLastAuthorizationCheck.current = auth.kind;
    if (
      previous === 'locked' &&
      auth.kind === 'unlocked' &&
      routedInterviewId !== null
    ) {
      authorizedInterviewId.current = routedInterviewId;
    }
  }, [auth.kind, routedInterviewId]);

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

    if (
      auth.kind === 'unlocked' ||
      auth.kind === 'unconfigured' ||
      auth.kind === 'corrupt'
    ) {
      clearInterviewRecoveryRestriction();
    }

    if (auth.kind === 'unconfigured' || auth.kind === 'corrupt') {
      setAuthorizedInterviewId(null);
    }

    // An authorization marker is useful only while an interview route is
    // active (including the locked refresh that temporarily replaces it with
    // AuthGate). Once the unlocked app is visibly elsewhere, discard any
    // stale marker so a later visit cannot bypass the entry gate. Setting a
    // marker during NewSessionForm does not re-render this provider, so the
    // synchronous navigation that follows still carries it into the new route.
    if (
      auth.kind === 'unlocked' &&
      !isInterviewRoutePath(location) &&
      authorizedInterviewId.current !== null
    ) {
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
  }, [auth.kind, closeAllDialogs, location, setAuthorizedInterviewId]);

  const requireFreshUnlock = useCallback(async (): Promise<StepUpResult> => {
    if (auth.kind !== 'unlocked' || !auth.mode || auth.mode === 'none') {
      return { ok: true };
    }
    return new Promise<StepUpResult>((resolve) => {
      pendingResolve.current = resolve;
      // Capture this when the prompt opens. A route change while authentication
      // is pending must not turn destructive recovery back on for the same
      // dialog. Read the live pathname rather than the routed location: a
      // location dependency would give this callback a new identity on every
      // navigation, re-running consumer effects that list it in their deps —
      // including the interview route's enter gate while App.tsx's
      // AnimatePresence holds the exiting route mounted, which raised a
      // phantom step-up prompt over Home after a gated interview exit.
      setAllowDestructiveRecovery(
        !isInterviewRoutePath(window.location.pathname),
      );
      setOpen(true);
    });
  }, [auth.kind, auth.mode]);

  const contextValue = useMemo(
    () => ({
      requireFreshUnlock,
      getAuthorizedInterviewId,
      setAuthorizedInterviewId,
    }),
    [requireFreshUnlock, getAuthorizedInterviewId, setAuthorizedInterviewId],
  );

  return (
    <StepUpAuthContext.Provider value={contextValue}>
      {children}
      <StepUpAuthDialog
        open={open}
        allowDestructiveRecovery={allowDestructiveRecovery}
        onResolve={handleResolve}
      />
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
