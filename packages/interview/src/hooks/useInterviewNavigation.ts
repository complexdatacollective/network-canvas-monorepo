'use client';

import { invariant } from 'es-toolkit';
import {
  type ElementType,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { useCurrentStep } from '../contexts/CurrentStepContext';
import getInterface from '../interfaces';
import {
  getCurrentStage,
  getNavigationInfo,
  getPromptCount,
  getStageCount,
} from '../selectors/session';
import { getNavigableStages } from '../selectors/skip-logic';
import { calculateProgress } from '../selectors/utils';
import { getStages } from '../store/modules/protocol';
import { transitionStage, updatePrompt } from '../store/modules/session';
import type {
  BeforeNextFunction,
  Direction,
  RegisterBeforeNext,
  StageProps,
} from '../types';
import useReadyForNextStage from './useReadyForNextStage';
import { useStageSelector } from './useStageSelector';

export default function useInterviewNavigation() {
  const dispatch = useDispatch();

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
  const { nextValidStageIndex, previousValidStageIndex, isCurrentStepValid } =
    useStageSelector(getNavigableStages);
  const stageCount = useSelector(getStageCount);
  const promptCount = useStageSelector(getPromptCount);
  const stages = useSelector(getStages);

  // Helper to get prompt count for a specific stage index
  const getPromptCountForStage = useCallback(
    (stageIndex: number) => {
      const targetStage = stages[stageIndex];
      if (targetStage && 'prompts' in targetStage && targetStage.prompts) {
        return targetStage.prompts.length;
      }
      return 1; // Default to 1 if no prompts (same as getPromptCount selector)
    },
    [stages],
  );

  // Refs to avoid stale closures in navigation callbacks
  const nextValidStageIndexRef = useRef(nextValidStageIndex);
  const previousValidStageIndexRef = useRef(previousValidStageIndex);

  useEffect(() => {
    nextValidStageIndexRef.current = nextValidStageIndex;
  }, [nextValidStageIndex]);

  useEffect(() => {
    previousValidStageIndexRef.current = previousValidStageIndex;
  }, [previousValidStageIndex]);

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
  const canNavigate = async (direction: Direction) => {
    const handlers = beforeNextHandlers.current;
    if (handlers.size === 0) {
      return true;
    }

    let hasForce = false;
    for (const fn of handlers.values()) {
      const result = await fn(direction);

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
      const stageAllowsNavigation = await canNavigate('forwards');

      if (!stageAllowsNavigation) {
        return;
      }

      // Advance the prompt if we're not at the last one.
      if (stageAllowsNavigation !== 'FORCE' && !isLastPrompt) {
        dispatch(updatePrompt(promptIndex + 1));
        return;
      }

      // From this point on we are definitely navigating stages
      const nextPromptCount = getPromptCountForStage(
        nextValidStageIndexRef.current,
      );
      const fakeProgress = calculateProgress(
        nextValidStageIndexRef.current,
        stageCount,
        0,
        nextPromptCount,
      );
      setProgress(fakeProgress);
      registerBeforeNext(null);

      setStep(nextValidStageIndexRef.current);
    } finally {
      setForceNavigationDisabled(false);
    }
  }, [
    dispatch,
    isLastPrompt,
    promptIndex,
    registerBeforeNext,
    stageCount,
    getPromptCountForStage,
    setStep,
  ]);

  const moveBackward = useCallback(async () => {
    setForceNavigationDisabled(true);

    try {
      const stageAllowsNavigation = await canNavigate('backwards');

      if (!stageAllowsNavigation) {
        return;
      }

      if (stageAllowsNavigation !== 'FORCE' && !isFirstPrompt) {
        dispatch(updatePrompt(promptIndex - 1));
        return;
      }

      const prevPromptCount = getPromptCountForStage(
        previousValidStageIndexRef.current,
      );
      const fakeProgress = calculateProgress(
        previousValidStageIndexRef.current,
        stageCount,
        0,
        prevPromptCount,
      );
      setProgress(fakeProgress);
      registerBeforeNext(null);
      setStep(previousValidStageIndexRef.current);
    } finally {
      setForceNavigationDisabled(false);
    }
  }, [
    setStep,
    dispatch,
    isFirstPrompt,
    promptIndex,
    registerBeforeNext,
    stageCount,
    getPromptCountForStage,
  ]);

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

  // If the current stage should be skipped, move to the previous valid stage.
  useEffect(() => {
    if (!isCurrentStepValid) {
      // eslint-disable-next-line no-console
      console.log(
        '⚠️ Invalid stage! Moving you to the previous valid stage...',
      );
      setStep(previousValidStageIndex);
    }
  }, [setStep, isCurrentStepValid, previousValidStageIndex]);

  const { canMoveForward, canMoveBackward } =
    useStageSelector(getNavigationInfo);

  return {
    // Stage rendering
    stage,
    currentStep,
    displayedStep,
    showStage,
    CurrentInterface,
    registerBeforeNext,
    getNavigationHelpers,
    handleExitComplete,

    // Navigation controls
    moveForward,
    moveBackward,
    disableMoveForward: forceNavigationDisabled || !canMoveForward,
    disableMoveBackward:
      forceNavigationDisabled ||
      (!canMoveBackward && beforeNextHandlers.current.size === 0),
    pulseNext: isReadyForNextStage,
    progress,
  };
}
