import type {
  SkipLogic,
  SkipLogicDestination,
} from '@codaco/protocol-validation';
import type { NcNetwork } from '@codaco/shared-consts';

import getQuery from './query.ts';

type StageReference = { id: string; type?: string };

/**
 * Resolve a skip destination against protocol stages.
 *
 * A finish destination resolves to the first finish stage after the owning
 * stage, which is where the interview ends; a stage list without one (a
 * protocol that has not been validated) falls back to the one-past-the-end
 * index. A stage destination resolves only when its target exists strictly
 * after the owning stage. Invalid direct callers fall back to the legacy
 * local-stage skip.
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
    const finishIndex = stages.findIndex(
      (stage, index) =>
        index > owningStageIndex && stage.type === 'FinishSession',
    );
    return finishIndex === -1 ? stages.length : finishIndex;
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
