import type { Stage } from '@codaco/protocol-validation';

import { stagePlacement } from '../../fields/skipLogicDestination.ts';
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
 * Where this stage runs is `stagePlacement`'s answer, which is the same one
 * the skip-logic destination control asks: an existing stage is found in the
 * order, and a stage being CREATED is where the host is about to insert it.
 * A new stage displaces the stage currently at its index, so the pedigrees
 * that precede it are those before that index in both cases. Reading a
 * creation as "last" instead offered a new stage inserted at the top of the
 * interview every pedigree in it, including the ones it would run before.
 */
export function resolveSourceStages(
  context: ProtocolBuilderProtocolContext,
  thisStageId: string,
  currentSourceStageId: unknown,
  /**
   * Where a stage being CREATED will be inserted, counting from zero. Only
   * consulted for a stage the order does not contain yet; left out, such a
   * stage is treated as arriving at the end, which is where a host that
   * appends puts it.
   */
  position?: number,
): SourceStageResolution {
  const stages = context.orderedStages;
  const placement = stagePlacement(
    stages,
    thisStageId,
    position,
    // The order as the protocol states it, so a stage the schema refuses —
    // one an import left with an empty `diseases` list, which is exactly the
    // stage a researcher opens this editor to repair — keeps the place the
    // interview runs it at instead of being read as a new one appended last.
    context.stageOrder,
  );

  const options = stages
    .slice(0, placement.index)
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
  const stage = sourceStageOf(context, sourceStageId);
  if (stage === undefined) return undefined;
  const nodeType = stage.nodeConfig.type;
  return typeof nodeType === 'string' ? nodeType : undefined;
}

const sourceStageOf = (
  context: ProtocolBuilderProtocolContext,
  sourceStageId: unknown,
): Extract<Readonly<Stage>, { type: 'FamilyPedigree' }> | undefined => {
  if (typeof sourceStageId !== 'string') return undefined;
  const stage = context.orderedStages.find(
    (candidate) => candidate.id === sourceStageId,
  );
  return stage !== undefined && stage.type === 'FamilyPedigree'
    ? stage
    : undefined;
};

/**
 * The attributes the source pedigree actually RECORDS about a family member.
 *
 * A disease mapping only reads: it colours the family tree from an attribute
 * the interview has already written. The Family Pedigree writes a boolean onto
 * a family member in exactly one place — a nomination prompt, where the
 * participant is asked who the question applies to and everyone they pick is
 * marked. Its member form is the other surface that collects an attribute, and
 * it is deliberately not counted here: a form field is a VALIDATED writer and a
 * disease mapping an unvalidated one, so the protocol reports a role conflict
 * for an attribute both name, and the shared cross-class exclusion drops those
 * from this picker with a refusal of its own.
 *
 * So an attribute no nomination prompt of the source pedigree records is one
 * nothing ever sets to `true`, and the genetics engine treats only an explicit
 * `true` as affected: a disease mapped to it draws an unmarked family, in
 * every interview, with no error anywhere to say so. That is what this set
 * exists to keep out of the picker and out of the save.
 *
 * Read from the protocol context rather than passed down, so a nomination prompt
 * a collaborator adds to the source pedigree appears here without this stage
 * doing anything.
 */
export function sourceStageRecordedVariables(
  context: ProtocolBuilderProtocolContext,
  sourceStageId: unknown,
): ReadonlySet<string> {
  const stage = sourceStageOf(context, sourceStageId);
  const prompts = stage?.nominationPrompts;
  if (!Array.isArray(prompts)) return new Set();
  // Read defensively rather than trusted from the type: the context holds the
  // protocol as the host last sent it, which is a document a collaborator can
  // leave half-written.
  return new Set(
    prompts.flatMap((prompt: unknown) =>
      typeof prompt === 'object' &&
      prompt !== null &&
      'variable' in prompt &&
      typeof prompt.variable === 'string'
        ? [prompt.variable]
        : [],
    ),
  );
}

/**
 * Whether one disease row maps an attribute the source pedigree never records.
 *
 * The same question `sourceStageRecordedVariables` answers for the picker,
 * asked of a row that is already there. A row an import brought in, or one a
 * collaborator invalidated by deleting the nomination prompt behind it, never
 * went through the picker at all — and the mapping it leaves behind draws an
 * unmarked family in every interview, because nothing ever sets the attribute
 * to `true`.
 *
 * A row with no attribute yet is not this rule's business: an unfinished row
 * is what `required` reports, and complaining that a blank marks nobody would
 * put two refusals on one empty control.
 */
export function diseaseMarksNobody(
  row: unknown,
  recorded: ReadonlySet<string>,
): boolean {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) {
    return false;
  }
  const variable: unknown = Reflect.get(row, 'variable');
  return (
    typeof variable === 'string' && variable !== '' && !recorded.has(variable)
  );
}
