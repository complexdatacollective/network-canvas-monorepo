import { createSelector } from '@reduxjs/toolkit';

import {
  isStageSkipped,
  resolveSkipLogicDestinationIndex,
} from '@codaco/network-query';
import type {
  SkipLogic,
  SkipLogicDestination,
} from '@codaco/protocol-validation';
import type { NcNetwork } from '@codaco/shared-consts';

import { getStages } from '../store/modules/protocol';
import type { RootState } from '../store/store';
import { getNetwork, getStageIndex } from './session';

type RoutableStage = {
  id: string;
  skipLogic?: SkipLogic;
};

export type AvailableStage = {
  kind: 'available';
};

export type LocallySkippedStage = {
  kind: 'local-skip';
  destination?: SkipLogicDestination;
};

export type BypassedStage = {
  kind: 'bypassed';
  by: {
    stageId: string;
    stageIndex: number;
    destination: SkipLogicDestination;
  };
};

export type StageAvailability =
  | AvailableStage
  | LocallySkippedStage
  | BypassedStage;

export type UnavailableStage = LocallySkippedStage | BypassedStage;

export type NavigableStages = {
  currentAvailability: StageAvailability | undefined;
  isCurrentStepValid: boolean;
  nextValidStageIndex: number;
  previousValidStageIndex: number;
};

const AVAILABLE: AvailableStage = { kind: 'available' };

/**
 * Build the active interview route in protocol order.
 *
 * A hidden, reachable stage may bypass the stages before its configured
 * destination. Rules on those bypassed stages are deliberately not evaluated;
 * the destination itself remains reachable and is evaluated normally, which
 * allows destinations to chain when they are also hidden.
 *
 * `stages` includes the synthetic FinishSession entry as its final item.
 */
export const buildStageAvailabilityMap = (
  stages: readonly RoutableStage[],
  network: NcNetwork,
): Record<number, StageAvailability> => {
  const availability = Object.fromEntries(
    stages.map((_, index) => [index, AVAILABLE]),
  ) as Record<number, StageAvailability>;
  const finishIndex = stages.length - 1;
  const protocolStages = stages.slice(0, finishIndex);

  for (let stageIndex = 0; stageIndex < stages.length; stageIndex += 1) {
    if (availability[stageIndex]?.kind === 'bypassed') {
      continue;
    }

    const stage = stages[stageIndex];
    if (!stage?.skipLogic || !isStageSkipped(stage.skipLogic, network)) {
      continue;
    }

    const { destination } = stage.skipLogic;
    availability[stageIndex] = {
      kind: 'local-skip',
      ...(destination ? { destination } : {}),
    };

    if (!destination) {
      continue;
    }

    const destinationIndex = resolveSkipLogicDestinationIndex(
      destination,
      protocolStages,
      stageIndex,
    );

    // Protocol validation guarantees a real forward target. Keep the runtime
    // defensive for preview/host payloads that may not have been validated.
    if (destinationIndex === undefined) {
      continue;
    }

    for (
      let bypassedIndex = stageIndex + 1;
      bypassedIndex < destinationIndex;
      bypassedIndex += 1
    ) {
      availability[bypassedIndex] = {
        kind: 'bypassed',
        by: {
          stageId: stage.id,
          stageIndex,
          destination,
        },
      };
    }
  }

  return availability;
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
