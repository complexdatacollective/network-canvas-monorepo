import {
  type createSelector,
  createSelectorCreator,
  lruMemoize as defaultMemoize,
} from '@reduxjs/toolkit';
import { isEqual } from 'es-toolkit';

import {
  type EntityPrimaryKey,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import type { StepChangeMeta } from '../contract/types';

// create a "selector creator" that uses lodash.isEqual instead of ===.
// Annotated as `typeof createSelector` to keep the public emitted type portable
// (reselect's `CreateSelectorFunction` is not nameable from a pnpm-mangled path).
export const createDeepEqualSelector: typeof createSelector =
  createSelectorCreator(defaultMemoize, isEqual);

/**
 * Utility function to calculate the progress of the interview.
 * Used in the progress bar as well as the getSessionProgress selector.
 */
export function calculateProgress(
  currentStep: number,
  totalSteps: number,
  currentPrompt: number,
  totalPrompts: number,
) {
  // Not `totalSteps - 1`: reaching the last stage (the finish stage) is not
  // the end of it, so its own worth is added below, reaching 100 on its last
  // prompt.
  const stageProgress = currentStep / totalSteps;

  const stageWorth = 1 / totalSteps; // The amount of progress each stage is worth

  const promptProgress = totalPrompts === 1 ? 1 : currentPrompt / totalPrompts; // 1 when finished

  const promptWorth = promptProgress * stageWorth;

  const percentProgress = (stageProgress + promptWorth) * 100;

  return percentProgress;
}

export const notInSet =
  (set: Set<NcNode[EntityPrimaryKey]>) => (node: NcNode) =>
    !set.has(node[entityPrimaryKeyProperty]);

/**
 * The minimal stage shape `getInterviewProgress` reads: every stage has a
 * discriminating `type`, and multi-prompt stages additionally carry a `prompts`
 * array. The protocol's `Stage[]` satisfies this structurally (typing it this
 * way keeps the helper callable with bare stage fixtures in tests).
 */
type ProgressStage = { type: string; prompts?: readonly unknown[] };

/**
 * How many stages progress is measured over: those up to and including the
 * first finish stage. A protocol's further finish stages are alternative
 * endings a participant reaches instead of the first, never after it, so they
 * add nothing to the way through.
 */
export function progressStepCount(stages: readonly { type: string }[]) {
  const firstFinish = stages.findIndex(
    (stage) => stage.type === 'FinishSession',
  );
  return firstFinish === -1 ? stages.length : firstFinish + 1;
}

/**
 * Participant-facing progress for a freshly entered stage. Pass the protocol's
 * stages (finish stages included) and the host-controlled step; `totalSteps`
 * is the count of stages progress is measured over (`progressStepCount`) and
 * `progress` matches the interview's own progress bar at
 * the start of `currentStep` (prompt index 0). On any finish stage progress is
 * 100: the interview ends there, whichever of several it is.
 */
export function getInterviewProgress(
  stages: readonly ProgressStage[],
  currentStep: number,
): StepChangeMeta {
  const totalSteps = progressStepCount(stages);
  const stage = stages[currentStep];
  const promptCount = stage?.prompts?.length ?? 1;

  return {
    // Every finish stage ends the interview, not only the last one.
    progress:
      stage?.type === 'FinishSession'
        ? 100
        : calculateProgress(currentStep, totalSteps, 0, promptCount),
    totalSteps,
  };
}
