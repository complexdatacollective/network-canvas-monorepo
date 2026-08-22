import type { Stage } from '@codaco/protocol-validation';

import type { GenerationContext } from '../../constraints/context';
import { invariant } from '../../utils/invariant';
import type { SimulationContext } from '../types';

/**
 * The step index the engine stamps a stage's writes with.
 *
 * The engine reads `stageId` and the current prompt off the protocol's own
 * stage list, so a simulator has to say WHERE in that list it is working. The
 * walk hands simulators the stage rather than its index — the index is a
 * property of the protocol, not of the participant's visit — so it is looked
 * up here by id.
 *
 * By id rather than by identity: a test driving one simulator builds the stage
 * it is testing and the protocol around it, and holding those to be the same
 * object would be a coupling the production walk does not need either.
 */
export const currentStepOf = (
  context: SimulationContext,
  stage: Stage,
): number => {
  const index = context.protocol.stages.findIndex(
    (candidate) => candidate.id === stage.id,
  );
  invariant(
    index >= 0,
    `stage "${stage.id}" is not one of the protocol's own stages`,
  );
  return index;
};

/** The three session-scoped handles a constrained draw reads. */
export const generationFor = (
  context: SimulationContext,
): GenerationContext => ({
  codebook: context.protocol.codebook,
  valueGen: context.valueGen,
  uniqueRegistry: context.uniqueRegistry,
});

/**
 * The prompts of a stage the participant actually worked, honouring a
 * `stopAt.promptIndex` bound.
 *
 * `promptBound` is exclusive — 0 means they arrived and have done nothing —
 * and absent means they worked the stage through.
 */
export const promptsWorked = <T>(
  prompts: readonly T[],
  promptBound: number | undefined,
): readonly T[] =>
  promptBound === undefined ? prompts : prompts.slice(0, promptBound);

/**
 * The stage filter a simulator applies: the stage's own, unless the run asked
 * for filtering to be ignored (`respectFiltering: false`), in which case every
 * stage reads the unfiltered network — the same bypass the option's host
 * toggle has always promised alongside skip logic.
 */
export const stageFilterOf = <F>(
  context: SimulationContext,
  filter: F | undefined,
): F | undefined => (context.respectFiltering ? filter : undefined);
