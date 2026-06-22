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
  // Don't subtract 1 because we have a finish stage automatically added that isn't accounted for.
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
 * Participant-facing progress for a freshly entered stage, encapsulating the
 * package's appended FinishSession stage so hosts don't have to. Pass the raw
 * protocol stages (without the finish stage) and the host-controlled step;
 * `totalSteps` is `stages.length + 1` and `progress` matches the interview's own
 * progress bar at the start of `currentStep` (prompt index 0). When
 * `currentStep` equals `stages.length`, the participant is on the finish stage
 * and progress is 100.
 */
export function getInterviewProgress(
  stages: readonly ProgressStage[],
  currentStep: number,
): StepChangeMeta {
  const totalSteps = stages.length + 1; // + 1 for the appended FinishSession stage
  const stage = stages[currentStep];
  const promptCount = stage?.prompts?.length ?? 1;

  return {
    progress: calculateProgress(currentStep, totalSteps, 0, promptCount),
    totalSteps,
  };
}
