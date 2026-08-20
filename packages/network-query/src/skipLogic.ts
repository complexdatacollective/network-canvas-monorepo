import type {
  SkipLogic,
  SkipLogicDestination,
} from '@codaco/protocol-validation';
import type { NcNetwork } from '@codaco/shared-consts';

import getQuery from './query';

type StageReference = { id: string };

/**
 * Resolve a skip destination against protocol stages.
 *
 * The stage list must exclude Interviewer's synthetic finish stage. A finish
 * destination therefore resolves to the one-past-the-end index, while a stage
 * destination resolves only when its target exists strictly after the owning
 * stage. Invalid direct callers fall back to the legacy local-stage skip.
 */
export const resolveSkipLogicDestinationIndex = (
  destination: SkipLogicDestination,
  stages: readonly StageReference[],
  owningStageIndex: number,
): number | undefined => {
  if (
    !Number.isInteger(owningStageIndex) ||
    owningStageIndex < 0 ||
    owningStageIndex >= stages.length
  ) {
    return undefined;
  }

  if (destination.type === 'finish') {
    return stages.length;
  }

  const destinationIndex = stages.findIndex(
    (stage) => stage.id === destination.stageId,
  );

  return destinationIndex > owningStageIndex ? destinationIndex : undefined;
};

/**
 * Evaluate whether a stage should be skipped for the current network.
 *
 * `SKIP` hides the stage when its filter matches, while `SHOW` hides it when
 * the filter does not match.
 */
export const isStageSkipped = (
  skipLogic: SkipLogic,
  network: NcNetwork,
): boolean => {
  const matches = getQuery(skipLogic.filter)(network);

  return skipLogic.action === 'SKIP' ? matches : !matches;
};

export type AvailableStage = { kind: 'available' };

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

export type RoutableStage = {
  id: string;
  skipLogic?: SkipLogic;
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
 *
 * Lives here rather than in the interview runtime because it is not only the
 * runtime's question: synthetic generation walks the same route, and a second
 * implementation of these bypass rules would be a second answer to "which
 * stages does this participant see".
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

    // Protocol validation guarantees a real forward target. Keep this
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
