'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type CurrentStepContextValue = {
  /**
   * The host-controlled (or internally-managed) target step. Updated
   * synchronously by `setCurrentStep`. Use this when navigating — for the
   * "where do we want to be?" answer.
   */
  currentStep: number;
  /**
   * The step the rendered stage corresponds to. Lags behind `currentStep`
   * during a stage transition: a change to `currentStep` triggers an exit
   * animation on the previous stage, and `displayedStep` only catches up
   * once that exit completes (Shell calls `commitDisplayedStep` from
   * AnimatePresence's `onExitComplete`).
   *
   * Use this for any read that should remain stable for the *currently
   * rendered* stage — most importantly, selectors that derive data from a
   * step (`useStageSelector`). If those read the live `currentStep` instead,
   * a still-mounted exiting stage's component sees the next stage's data
   * mid-render, which has caused effects in some interfaces to fire as if
   * they were on the new stage.
   */
  displayedStep: number;
  setCurrentStep: (step: number) => void;
  /** Called by Shell from AnimatePresence's `onExitComplete`. */
  commitDisplayedStep: () => void;
};

const CurrentStepContext = createContext<CurrentStepContextValue | null>(null);

type CurrentStepProviderProps = {
  /** Controlled mode: host owns the step. Pass alongside `onStepChange`. */
  currentStep?: number;
  /** Controlled mode: called whenever the package wants to change the step. */
  onStepChange?: (step: number) => void;
  children: ReactNode;
};

/**
 * Provides the single source of truth for which interview stage is currently
 * displayed. Resolves the controlled/uncontrolled component pattern: hosts may
 * own the step (pass both `currentStep` and `onStepChange`) or let the package
 * own it via internal state (pass neither).
 *
 * Replaces the old `state.session.currentStep` Redux field. Keeping the step
 * out of Redux removes the dual-source sync problem and lets each host plug
 * in its own state mechanism (URL params via nuqs, query string, sessionStorage,
 * plain useState, etc.).
 */
export function CurrentStepProvider({
  currentStep: controlledStep,
  onStepChange,
  children,
}: CurrentStepProviderProps) {
  const [internalStep, setInternalStep] = useState(0);
  const isControlled = controlledStep !== undefined;
  const currentStep = isControlled ? controlledStep : internalStep;

  // `displayedStep` lags behind `currentStep` during a transition. Initialised
  // to `currentStep` on first mount so there is no transition for the initial
  // render.
  const [displayedStep, setDisplayedStep] = useState(currentStep);

  // Anchor onStepChange in a ref so the returned setCurrentStep is stable
  // across host re-renders that pass an inline arrow.
  const onStepChangeRef = useRef(onStepChange);
  onStepChangeRef.current = onStepChange;

  const setCurrentStep = useCallback(
    (step: number) => {
      if (onStepChangeRef.current) {
        onStepChangeRef.current(step);
      } else {
        setInternalStep(step);
      }
    },
    // Setter is stable; ref keeps the closure fresh.
    [],
  );

  // `currentStep` is the latest target; we capture it in a ref so
  // `commitDisplayedStep` reads the live value (it's called from an
  // AnimatePresence callback that may close over a stale value).
  const currentStepRef = useRef(currentStep);
  currentStepRef.current = currentStep;

  const commitDisplayedStep = useCallback(() => {
    setDisplayedStep(currentStepRef.current);
  }, []);

  // Mixing controlled and uncontrolled is unsupported. Warn the host so they
  // know to provide both `currentStep` and `onStepChange` together (or neither).
  useEffect(() => {
    if (controlledStep !== undefined && !onStepChange) {
      // eslint-disable-next-line no-console
      console.warn(
        '[interview] currentStep was provided without onStepChange. ' +
          'This puts the package into a read-only state — internal navigation will not work.',
      );
    }
  }, [controlledStep, onStepChange]);

  const value = useMemo(
    () => ({ currentStep, displayedStep, setCurrentStep, commitDisplayedStep }),
    [currentStep, displayedStep, setCurrentStep, commitDisplayedStep],
  );

  return (
    <CurrentStepContext.Provider value={value}>
      {children}
    </CurrentStepContext.Provider>
  );
}

/**
 * Returns the current stage step index plus a setter. The setter routes through
 * the host's `onStepChange` in controlled mode, or updates internal state in
 * uncontrolled mode.
 */
export function useCurrentStep(): CurrentStepContextValue {
  const value = useContext(CurrentStepContext);
  if (!value) {
    throw new Error('useCurrentStep must be used within a CurrentStepProvider');
  }
  return value;
}
