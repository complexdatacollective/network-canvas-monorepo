import { buildStageAvailabilityMap, type RoutableStage } from '@codaco/network-query';
import type { NcNetwork } from '@codaco/shared-consts';

/**
 * The synthetic entry `buildStageAvailabilityMap` expects as its last item, so
 * a `finish` destination bypasses every authored stage after the one that
 * jumped — exactly as in the interview, where the runtime appends its own
 * FinishSession entry for the same reason.
 */
const FINISH_SENTINEL: RoutableStage = { id: '__finish__' };

/**
 * The next stage the participant reaches after `after`, or `undefined` where
 * the interview is over.
 *
 * The route is resolved against the network AS IT NOW STANDS rather than once
 * up front, because skip logic reads the network this walk is building: a rule
 * about whether anyone was named cannot be settled before the naming happens,
 * and the interview itself re-derives the route on every navigation for the
 * same reason. One implementation serves both (decision 13): this is the
 * runtime's own availability map, relocated to `@codaco/network-query`.
 */
export const nextStageIndex = (
  stages: readonly RoutableStage[],
  network: NcNetwork,
  after: number,
  respectSkipLogic: boolean,
): number | undefined => {
  const candidate = after + 1;

  if (!respectSkipLogic) {
    return candidate < stages.length ? candidate : undefined;
  }

  const availability = buildStageAvailabilityMap(
    [...stages, FINISH_SENTINEL],
    network,
  );

  for (let index = candidate; index < stages.length; index += 1) {
    if (availability[index]?.kind === 'available') return index;
  }

  return undefined;
};
