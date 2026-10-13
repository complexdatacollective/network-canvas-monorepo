import { createSelector } from '@reduxjs/toolkit';

import {
  filter as networkFilter,
  isStageSkipped,
  resolveSkipLogicDestinationIndex,
} from '@codaco/network-query';
import type {
  Filter,
  SkipLogic,
  SkipLogicDestination,
} from '@codaco/protocol-validation';
import type { NcNetwork } from '@codaco/shared-consts';

import { getStages } from '../store/modules/protocol';
import type { RootState } from '../store/store';
import { getNetwork, getStageIndex } from './session';

type RoutableStage = {
  id: string;
  type?: string;
  skipLogic?: SkipLogic;
  subject?: { entity: string; type?: string };
  filter?: Filter;
  behaviours?: { freeDraw?: boolean };
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

/**
 * A stage that works only with the people or relationships it shows, when the
 * network has none for it to show, so the participant has nothing to do there.
 */
export type EmptyStage = {
  kind: 'empty';
};

export type StageAvailability =
  | AvailableStage
  | LocallySkippedStage
  | BypassedStage
  | EmptyStage;

export type UnavailableStage = LocallySkippedStage | BypassedStage | EmptyStage;

export type NavigableStages = {
  currentAvailability: StageAvailability | undefined;
  isCurrentStepValid: boolean;
  nextValidStageIndex: number;
  previousValidStageIndex: number;
};

const AVAILABLE: AvailableStage = { kind: 'available' };
const EMPTY: EmptyStage = { kind: 'empty' };

// How many of a stage's subject the network must hold for these stages to
// give the participant something to do: a form, bin, map or canvas needs one
// person or relationship, and a census one pair of people. Stages that add
// people (the name generators and the Network Composer) and stages that show
// no subject are never empty.
const SUBJECTS_NEEDED: Partial<Record<string, number>> = {
  AlterForm: 1,
  AlterEdgeForm: 1,
  CategoricalBin: 1,
  OrdinalBin: 1,
  Geospatial: 1,
  Sociogram: 1,
  Narrative: 1,
  DyadCensus: 2,
  TieStrengthCensus: 2,
  OneToManyDyadCensus: 2,
};

/**
 * Whether a stage that works with its subjects has none to work with,
 * counting the subjects its interface shows: those of the stage's subject
 * type in the network its filter leaves. A Narrative that lets the
 * participant draw still has something to do on an empty canvas.
 */
const hasNothingToAsk = (stage: RoutableStage, network: NcNetwork): boolean => {
  const needed = stage.type ? SUBJECTS_NEEDED[stage.type] : undefined;
  const subject = stage.subject;
  if (needed === undefined || !subject) return false;
  if (stage.type === 'Narrative' && stage.behaviours?.freeDraw) return false;

  const visible = stage.filter ? networkFilter(stage.filter)(network) : network;
  const entities = subject.entity === 'edge' ? visible.edges : visible.nodes;
  let count = 0;
  for (const entity of entities) {
    if (entity.type === subject.type) count += 1;
    if (count >= needed) return false;
  }
  return true;
};

/**
 * Build the active interview route in protocol order.
 *
 * A hidden, reachable stage may bypass the stages before its configured
 * destination. Rules on those bypassed stages are deliberately not evaluated;
 * the destination itself remains reachable and is evaluated normally, which
 * allows destinations to chain when they are also hidden.
 *
 * A reachable stage that gives the participant nothing to do is off the route too, so
 * navigation passes it in either direction, and a participant who comes back
 * from the stage after it is not sent forward again.
 */
export const buildStageAvailabilityMap = (
  stages: readonly RoutableStage[],
  network: NcNetwork,
): Record<number, StageAvailability> => {
  const availability = Object.fromEntries(
    stages.map((_, index) => [index, AVAILABLE]),
  ) as Record<number, StageAvailability>;
  for (let stageIndex = 0; stageIndex < stages.length; stageIndex += 1) {
    if (availability[stageIndex]?.kind === 'bypassed') {
      continue;
    }

    const stage = stages[stageIndex];
    if (!stage) continue;
    if (!stage.skipLogic || !isStageSkipped(stage.skipLogic, network)) {
      if (hasNothingToAsk(stage, network)) availability[stageIndex] = EMPTY;
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
      stages,
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

/**
 * Select the last stage on the active route before the interview ends, for a
 * saved network: the stage a review of a finished interview stops at. Finish
 * stages are not reviewed, because finishing is not something a review can
 * do. Returns undefined when the active route reaches no other stage.
 */
export const getLastAvailableAuthoredStageIndex = (
  stages: readonly RoutableStage[],
  network: NcNetwork,
): number | undefined => {
  const availability = buildStageAvailabilityMap(stages, network);

  for (let index = stages.length - 1; index >= 0; index -= 1) {
    if (stages[index]?.type === 'FinishSession') continue;
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
 * destination). A stage with nothing to ask about recovers forward as well, as
 * the participant has nothing left to do there. Legacy local skips without a
 * destination retain their existing recovery behavior: prefer the nearest
 * earlier stage, then advance when none exists. The render gate prevents
 * unavailable content from flashing first.
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
  const recoversForward =
    currentAvailability?.kind === 'bypassed' ||
    currentAvailability?.kind === 'empty' ||
    (currentAvailability?.kind === 'local-skip' &&
      currentAvailability.destination !== undefined);

  if (recoversForward) {
    return nextValidStageIndex;
  }

  return previousValidStageIndex === currentStep
    ? nextValidStageIndex
    : previousValidStageIndex;
};
