import { createSelector } from '@reduxjs/toolkit';

import { getQuery } from '@codaco/network-query';

import { getStages } from '../store/modules/protocol';
import { getNetwork, getStageIndex } from './session';

// Hacked together version of isStageSkipped that returns a map of all stages.
// This is more convenient to use with useSelector. Keyed by stage index over
// the finish-inclusive stage list (`getStages`); the appended FinishSession
// sentinel has no skip logic and is always `false`.
export const getSkipMap = createSelector(
  getStages,
  getNetwork,
  (stages, network): Record<number, boolean> =>
    stages.reduce((acc: Record<number, boolean>, stage, index: number) => {
      const skipLogic = stage.skipLogic;

      if (!skipLogic) {
        return {
          ...acc,
          [index]: false,
        };
      }

      const skipOnMatch = skipLogic.action === 'SKIP';
      const result = getQuery(skipLogic.filter)(network);
      const isSkipped = (skipOnMatch && result) || (!skipOnMatch && !result);

      return {
        ...acc,
        [index]: isSkipped,
      };
    }, {}),
);

// Selector that uses the skipMap to determine the idex of the next and previous
// valid stages.
export const getNavigableStages = createSelector(
  getSkipMap,
  getStageIndex,
  (skipMap, currentStep) => {
    // To determine if the current step is valid, we check if it is not skipped,
    // and that it is within the bounds of the skipMap.
    const isCurrentStepValid =
      !skipMap[currentStep] && skipMap[currentStep] !== undefined;

    const nextStage = Object.keys(skipMap).find(
      (stage) =>
        Number.parseInt(stage) > currentStep &&
        skipMap[Number.parseInt(stage)] === false,
    );

    const previousStage = Object.keys(skipMap)
      .toReversed()
      .find(
        (stage) =>
          Number.parseInt(stage) < currentStep &&
          skipMap[Number.parseInt(stage)] === false,
      );

    return {
      isCurrentStepValid,
      nextValidStageIndex: nextStage ? Number.parseInt(nextStage) : currentStep,
      previousValidStageIndex: previousStage
        ? Number.parseInt(previousStage)
        : currentStep,
    };
  },
);

/**
 * Resolves the step to navigate to when the current step is invalid (skipped).
 *
 * Prefers the nearest earlier valid stage. When none exists — e.g. the
 * first/lowest stage is skipped on interview entry — `previousValidStageIndex`
 * falls back to `currentStep` (see `getNavigableStages`), so we instead advance
 * to the next valid stage. This guarantees a skipped stage is never rendered.
 */
export const resolveRecoveryStep = ({
  currentStep,
  previousValidStageIndex,
  nextValidStageIndex,
}: {
  currentStep: number;
  previousValidStageIndex: number;
  nextValidStageIndex: number;
}): number =>
  previousValidStageIndex === currentStep
    ? nextValidStageIndex
    : previousValidStageIndex;
