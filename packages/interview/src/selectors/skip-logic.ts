import { createSelector } from '@reduxjs/toolkit';

import {
  buildStageAvailabilityMap,
  type RoutableStage,
  type StageAvailability,
} from '@codaco/network-query';
import type { NcNetwork } from '@codaco/shared-consts';

import { getStages } from '../store/modules/protocol';
import type { RootState } from '../store/store';
import { getNetwork, getStageIndex } from './session';

/**
 * The availability types describe the route `buildStageAvailabilityMap` walks,
 * so they live beside it in `@codaco/network-query`. Re-exported here to keep
 * one import path for the runtime components that consume them.
 */
export type {
  StageAvailability,
  UnavailableStage,
} from '@codaco/network-query';

export type NavigableStages = {
  currentAvailability: StageAvailability | undefined;
  isCurrentStepValid: boolean;
  nextValidStageIndex: number;
  previousValidStageIndex: number;
};

/**
 * Select the final authored stage on the active route for a saved network.
 * The synthetic entry lets finish destinations bypass authored stages using
 * the same route calculation as the live interview. Returns undefined when
 * the active route contains no authored stage.
 */
export const getLastAvailableAuthoredStageIndex = (
  stages: readonly RoutableStage[],
  network: NcNetwork,
): number | undefined => {
  const availability = buildStageAvailabilityMap(
    [...stages, { id: '__finish__' }],
    network,
  );

  for (let index = stages.length - 1; index >= 0; index -= 1) {
    if (availability[index]?.kind === 'available') return index;
  }

  return undefined;
};

export const getStageAvailabilityMap = createSelector(
  getStages,
  getNetwork,
  buildStageAvailabilityMap,
);

/**
 * Compatibility view for consumers that only need to know whether a stage is
 * on the active route. Both a stage's own skip rule and an earlier stage's
 * targeted jump make it unavailable to automatic navigation.
 */
export const getSkipMap = createSelector(
  getStageAvailabilityMap,
  (availabilityMap): Record<number, boolean> =>
    Object.fromEntries(
      Object.entries(availabilityMap).map(([index, availability]) => [
        index,
        availability.kind !== 'available',
      ]),
    ),
);

// Selector that uses the live route to determine the nearest next and previous
// available stages for the supplied current step.
export const getNavigableStages: (
  state: RootState,
  currentStep: number,
) => NavigableStages = createSelector(
  getStageAvailabilityMap,
  getSkipMap,
  getStageIndex,
  (availabilityMap, skipMap, currentStep) => {
    const currentAvailability = availabilityMap[currentStep];
    const isCurrentStepValid = skipMap[currentStep] === false;
    const stageIndexes = Object.keys(skipMap).map(Number);

    const nextStage = stageIndexes.find(
      (stageIndex) => stageIndex > currentStep && skipMap[stageIndex] === false,
    );
    const previousStage = stageIndexes
      .toReversed()
      .find(
        (stageIndex) =>
          stageIndex < currentStep && skipMap[stageIndex] === false,
      );

    return {
      currentAvailability,
      isCurrentStepValid,
      nextValidStageIndex: nextStage ?? currentStep,
      previousValidStageIndex: previousStage ?? currentStep,
    };
  },
);

/**
 * Resolves the step to navigate to when the current step is unavailable.
 *
 * Targeted routes recover forward to their next active stage, which is the
 * configured destination (or the next available stage after a hidden/chained
 * destination). Legacy local skips without a destination retain their existing
 * recovery behavior: prefer the nearest earlier stage, then advance when none
 * exists. The render gate prevents unavailable content from flashing first.
 */
export const resolveRecoveryStep = ({
  currentStep,
  currentAvailability,
  previousValidStageIndex,
  nextValidStageIndex,
}: {
  currentStep: number;
  currentAvailability: StageAvailability | undefined;
  previousValidStageIndex: number;
  nextValidStageIndex: number;
}): number => {
  const isTargetedRoute =
    currentAvailability?.kind === 'bypassed' ||
    (currentAvailability?.kind === 'local-skip' &&
      currentAvailability.destination !== undefined);

  if (isTargetedRoute) {
    return nextValidStageIndex;
  }

  return previousValidStageIndex === currentStep
    ? nextValidStageIndex
    : previousValidStageIndex;
};
