import type { Stage } from '@codaco/protocol-validation';

import type { ProtocolBuilderProtocolContext } from '../../protocol-context.ts';

export type SourceStageOption = Readonly<{ value: string; label: string }>;

/**
 * Why a narrative pedigree's chosen source is not one it may use.
 *
 * `missing` covers a stage that has been deleted or dropped out of the
 * interview's order; `notAPedigree` a stage whose interface was changed;
 * `afterThisStage` one that has been moved to run later. All three are things
 * a collaborator can do while this editor is open, so none of them may throw:
 * the editor keeps showing the stored choice and says what is wrong with it.
 */
export type SourceStageProblem = 'missing' | 'notAPedigree' | 'afterThisStage';

const isPedigree = (stage: Readonly<Stage>) => stage.type === 'FamilyPedigree';

export type SourceStageResolution = Readonly<{
  /** The pedigrees this stage may read, in interview order. */
  options: readonly SourceStageOption[];
  /** What is wrong with the current choice, or `null` when nothing is. */
  problem: SourceStageProblem | null;
}>;

/**
 * The Family Pedigree stages a narrative pedigree may point at, and whether
 * the one it points at now is among them.
 *
 * Only pedigrees that run BEFORE this stage qualify: a narrative pedigree
 * renders a family the participant has already drawn, so a source that runs
 * later would be read while it is still empty. The protocol schema resolves
 * this stage's subject through the source's own node type, so a source that
 * has gone or moved leaves every disease mapping pointing at nothing — which
 * is a thing to report, not a thing to crash on.
 *
 * A stage the order does not list at all is treated as running last, which is
 * what a stage being created is: every existing pedigree precedes it.
 */
export function resolveSourceStages(
  context: ProtocolBuilderProtocolContext,
  thisStageId: string,
  currentSourceStageId: unknown,
): SourceStageResolution {
  const stages = context.orderedStages;
  const ownIndex = stages.findIndex((stage) => stage.id === thisStageId);
  const boundary = ownIndex === -1 ? stages.length : ownIndex;

  const options = stages
    .slice(0, boundary)
    .filter(isPedigree)
    .map((stage) => ({ value: stage.id, label: stage.label }));

  if (typeof currentSourceStageId !== 'string' || currentSourceStageId === '') {
    return { options, problem: null };
  }
  if (options.some((option) => option.value === currentSourceStageId)) {
    return { options, problem: null };
  }

  const chosen = stages.find((stage) => stage.id === currentSourceStageId);
  if (chosen === undefined) return { options, problem: 'missing' };
  if (!isPedigree(chosen)) return { options, problem: 'notAPedigree' };
  return { options, problem: 'afterThisStage' };
}

/** The node type a narrative pedigree's diseases are attributes of. */
export function sourceStageNodeType(
  context: ProtocolBuilderProtocolContext,
  sourceStageId: unknown,
): string | undefined {
  if (typeof sourceStageId !== 'string') return undefined;
  const stage = context.orderedStages.find(
    (candidate) => candidate.id === sourceStageId,
  );
  if (stage === undefined || stage.type !== 'FamilyPedigree') return undefined;
  const nodeType = stage.nodeConfig.type;
  return typeof nodeType === 'string' ? nodeType : undefined;
}
