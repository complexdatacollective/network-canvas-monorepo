'use client';

import { invariant } from 'es-toolkit';
import {
  type ElementType,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';

import { useCurrentStep } from '../contexts/CurrentStepContext';
import getInterface from '../interfaces';
import {
  getCurrentStage,
  getNavigationInfo,
  getPromptCount,
  getStageCount,
} from '../selectors/session';
import {
  getNavigableStages,
  getStageAvailabilityMap,
  resolveRecoveryStep,
  type UnavailableStage,
} from '../selectors/skip-logic';
import { calculateProgress, getInterviewProgress } from '../selectors/utils';
import { getProtocolStages } from '../store/modules/protocol';
import { transitionStage, updatePrompt } from '../store/modules/session';
import type { RootState } from '../store/store';
import type {
  BeforeNextFunction,
  Direction,
  NavigationIntent,
  RegisterBeforeNext,
  StageProps,
} from '../types';
import useReadyForNextStage from './useReadyForNextStage';
import { useStageSelector } from './useStageSelector';

export default function useInterviewNavigation(
  initialStageOverrideIndex?: number,
) {
  const dispatch = useDispatch();
  const interviewStore = useStore<RootState>();

  // `currentStep` is the latest navigation target (updated synchronously when
  // the user presses next). `displayedStep` lags during a stage exit
  // animation — see CurrentStepContext for the rationale. We use
  // `displayedStep` for the rendered stage's data and `currentStep` only
  // for navigation logic that needs the target.
  const {
    currentStep,
    displayedStep,
    setCurrentStep: setStep,
    commitDisplayedStep,
  } = useCurrentStep();
  const currentStepRef = useRef(currentStep);
  currentStepRef.current = currentStep;

  const [forceNavigationDisabled, setForceNavigationDisabled] = useState(false);

  // `showStage` toggles the rendered stage in/out of the JSX entirely so that
  // AnimatePresence sees "no child" during a transition (rather than a child
  // with a different key) and *fully unmounts* the old stage before any new
  // data reaches it. Without this, the still-mounted old stage's components
  // would receive the new context value mid-exit and re-render with the
  // wrong stage data, often crashing.
  const [showStage, setShowStage] = useState(true);

  useEffect(() => {
    if (currentStep !== displayedStep) {
      setShowStage(false);
    }
  }, [currentStep, displayedStep]);

  // Selectors
  const stage = useStageSelector(getCurrentStage);
  const CurrentInterface = stage
    ? (getInterface(stage.type) as ElementType<StageProps>)
    : null;

  const { isReady: isReadyForNextStage } = useReadyForNextStage();
  const { isLastPrompt, isFirstPrompt, promptIndex } =
    useStageSelector(getNavigationInfo);
  const displayedNavigation = useStageSelector(getNavigableStages);
  const currentNavigation = useSelector((state: RootState) =>
    getNavigableStages(state, currentStep),
  );
  const stageCount = useSelector(getStageCount);
  const promptCount = useStageSelector(getPromptCount);
  // The raw protocol stages (without the appended FinishSession stage). Passed
  // to getInterviewProgress to compute the participant-facing progress meta
  // handed back to the host via onStepChange.
  const protocolStages = useSelector(getProtocolStages);

  const [forcedStep, setForcedStep] = useState<number | null>(() =>
    initialStageOverrideIndex === currentStep
      ? initialStageOverrideIndex
      : null,
  );

  const [progress, setProgress] = useState(
    calculateProgress(currentStep, stageCount, promptIndex, promptCount),
  );

  useEffect(() => {
    setProgress(
      calculateProgress(currentStep, stageCount, promptIndex, promptCount),
    );
  }, [currentStep, stageCount, promptIndex, promptCount]);

  // beforeNext registration (multiple keyed handlers)
  const beforeNextHandlers = useRef(new Map<string, BeforeNextFunction>());
  const registerBeforeNext: RegisterBeforeNext = useCallback(
    (
      ...args: [BeforeNextFunction | null] | [string, BeforeNextFunction | null]
    ) => {
      if (args.length === 1) {
        const [fn] = args;
        if (fn === null) {
          beforeNextHandlers.current.clear();
        } else {
          beforeNextHandlers.current.set('default', fn);
        }
      } else {
        const [key, fn] = args;
        if (fn === null) {
          beforeNextHandlers.current.delete(key);
        } else {
          beforeNextHandlers.current.set(key, fn);
        }
      }
    },
    [],
  ) as RegisterBeforeNext;

  /**
   * Before navigation is allowed, we iterate all registered beforeNext handlers
   * in insertion order. If any returns false, navigation is blocked. If any
   * returns 'FORCE' (and none returned false), the prompt boundary is skipped.
   */
  const canNavigate = async (
    direction: Direction,
    intent: NavigationIntent,
  ) => {
    const handlers = beforeNextHandlers.current;
    if (handlers.size === 0) {
      return true;
    }

    let hasForce = false;
    for (const fn of handlers.values()) {
      const result = await fn(direction, intent);

      invariant(
        result === true || result === false || result === 'FORCE',
        `beforeNextFunction must return a boolean or the string 'FORCE'`,
      );

      if (result === false) {
        return false;
      }
      if (result === 'FORCE') {
        hasForce = true;
      }
    }

    return hasForce ? 'FORCE' : true;
  };

  const moveForward = useCallback(async () => {
    setForceNavigationDisabled(true);

    try {
      const stageAllowsNavigation = await canNavigate('forwards', 'step');

      if (!stageAllowsNavigation) {
        return;
      }

      // Advance the prompt if we're not at the last one.
      if (stageAllowsNavigation !== 'FORCE' && !isLastPrompt) {
        dispatch(updatePrompt(promptIndex + 1));
        return;
      }

      // From this point on we are definitely navigating stages
      // Read after beforeNext handlers finish: form submission can update the
      // network, which can immediately change the active route.
      const navigation = getNavigableStages(
        interviewStore.getState(),
        currentStepRef.current,
      );
      const nextStep = navigation.nextValidStageIndex;
      const meta = getInterviewProgress(protocolStages, nextStep);
      setProgress(meta.progress);
      registerBeforeNext(null);
      setForcedStep(null);

      setStep(nextStep, meta);
    } finally {
      setForceNavigationDisabled(false);
    }
  }, [
    dispatch,
    isLastPrompt,
    promptIndex,
    registerBeforeNext,
    protocolStages,
    setStep,
    interviewStore,
  ]);

  const moveBackward = useCallback(async () => {
    setForceNavigationDisabled(true);

    try {
      const stageAllowsNavigation = await canNavigate('backwards', 'step');

      if (!stageAllowsNavigation) {
        return;
      }

      if (stageAllowsNavigation !== 'FORCE' && !isFirstPrompt) {
        dispatch(updatePrompt(promptIndex - 1));
        return;
      }

      const navigation = getNavigableStages(
        interviewStore.getState(),
        currentStepRef.current,
      );
      const previousStep = navigation.previousValidStageIndex;
      const meta = getInterviewProgress(protocolStages, previousStep);
      setProgress(meta.progress);
      registerBeforeNext(null);
      setForcedStep(null);
      setStep(previousStep, meta);
    } finally {
      setForceNavigationDisabled(false);
    }
  }, [
    setStep,
    dispatch,
    isFirstPrompt,
    promptIndex,
    registerBeforeNext,
    protocolStages,
    interviewStore,
  ]);

  const goToStage = useCallback(
    async (
      targetIndex: number,
      confirmUnavailable?: (availability: UnavailableStage) => Promise<boolean>,
    ): Promise<void> => {
      if (targetIndex === currentStep || currentStep !== displayedStep) {
        return;
      }

      setForceNavigationDisabled(true);

      try {
        const direction: Direction =
          targetIndex > currentStep ? 'forwards' : 'backwards';

        // Confirm before running beforeNext handlers, so declining leaves the
        // current screen untouched rather than saving or resetting it first.
        const initialAvailability = getStageAvailabilityMap(
          interviewStore.getState(),
        )[targetIndex];
        let confirmedUnavailable = false;
        if (initialAvailability && initialAvailability.kind !== 'available') {
          confirmedUnavailable =
            (await confirmUnavailable?.(initialAvailability)) ?? false;
          if (!confirmedUnavailable) {
            return;
          }
        }

        const stageAllowsNavigation = await canNavigate(direction, 'jump');
        if (!stageAllowsNavigation) {
          return;
        }

        // Re-check after beforeNext handlers: saving the current screen may
        // have made this target locally hidden or bypassed by a new route.
        const targetAvailability = getStageAvailabilityMap(
          interviewStore.getState(),
        )[targetIndex];
        if (targetAvailability && targetAvailability.kind !== 'available') {
          const confirmed =
            confirmedUnavailable ||
            ((await confirmUnavailable?.(targetAvailability)) ?? false);
          if (!confirmed) {
            return;
          }
          setForcedStep(targetIndex);
        } else {
          setForcedStep(null);
        }

        const meta = getInterviewProgress(protocolStages, targetIndex);
        setProgress(meta.progress);
        registerBeforeNext(null);
        setStep(targetIndex, meta);
      } finally {
        setForceNavigationDisabled(false);
      }
    },
    [
      currentStep,
      displayedStep,
      protocolStages,
      registerBeforeNext,
      setStep,
      interviewStore,
    ],
  );

  const getNavigationHelpers = useCallback(
    () => ({
      moveForward,
      moveBackward,
    }),
    [moveForward, moveBackward],
  );

  // AnimatePresence's onExitComplete callback. Runs synchronously after the
  // previous stage has fully exited and is about to be unmounted. We must
  // reset stage-local Redux state (`transitionStage` clears promptIndex,
  // stageRequiresEncryption, and the passphrase prompter) BEFORE the new
  // stage's first render — otherwise the new stage's components see a
  // stale promptIndex from the previous stage and may crash trying to
  // access a prompt that doesn't exist on the new stage type.
  const handleExitComplete = useCallback(() => {
    commitDisplayedStep();
    dispatch(transitionStage());
    beforeNextHandlers.current.clear();
    setShowStage(true);
  }, [commitDisplayedStep, dispatch]);

  // If the current stage leaves the active route, recover without rendering
  // it. A one-stage manual/preview override is the only exception.
  useEffect(() => {
    if (!currentNavigation.isCurrentStepValid && currentStep !== forcedStep) {
      const recoveryStep = resolveRecoveryStep({
        currentStep,
        currentAvailability: currentNavigation.currentAvailability,
        previousValidStageIndex: currentNavigation.previousValidStageIndex,
        nextValidStageIndex: currentNavigation.nextValidStageIndex,
      });
      setStep(recoveryStep, getInterviewProgress(protocolStages, recoveryStep));
    }
  }, [setStep, currentNavigation, currentStep, forcedStep, protocolStages]);

  const { canMoveForward, canMoveBackward } =
    useStageSelector(getNavigationInfo);
  const isTransitioning = currentStep !== displayedStep;
  const hasPreviousAvailableStage =
    currentNavigation.previousValidStageIndex !== currentStep;
  const canRenderDisplayedStage =
    displayedNavigation.isCurrentStepValid || displayedStep === forcedStep;

  return {
    // Stage rendering
    stage,
    currentStep,
    displayedStep,
    showStage,
    canRenderStage: canRenderDisplayedStage,
    CurrentInterface,
    registerBeforeNext,
    getNavigationHelpers,
    handleExitComplete,

    // Navigation controls
    moveForward,
    moveBackward,
    goToStage,
    disableMoveForward:
      forceNavigationDisabled || isTransitioning || !canMoveForward,
    disableMoveBackward:
      forceNavigationDisabled ||
      isTransitioning ||
      ((!canMoveBackward || (isFirstPrompt && !hasPreviousAvailableStage)) &&
        beforeNextHandlers.current.size === 0),
    pulseNext: isReadyForNextStage,
    progress,
  };
}
