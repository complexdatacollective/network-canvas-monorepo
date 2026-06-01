import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';

import { useAuth } from './AuthContext';
import StepUpAuthDialog, { type StepUpResult } from './StepUpAuthDialog';

type StepUpAuthContextValue = {
  requireFreshUnlock: () => Promise<StepUpResult>;
};

const StepUpAuthContext = createContext<StepUpAuthContextValue | null>(null);

export function StepUpAuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const pendingResolve = useRef<((r: StepUpResult) => void) | null>(null);

  const handleResolve = useCallback((result: StepUpResult) => {
    setOpen(false);
    const resolve = pendingResolve.current;
    pendingResolve.current = null;
    resolve?.(result);
  }, []);

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
    <StepUpAuthContext.Provider value={{ requireFreshUnlock }}>
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
