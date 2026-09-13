import { useMemo } from 'react';

import { createMessageError } from '@codaco/app-i18n/messages';
import type { Variables } from '@codaco/protocol-validation';

import {
  buildExclusiveVariableSlotMap,
  buildVariableRoleMap,
  excludeInterfaceOwned,
  excludeValidatedUses,
  type ExclusiveVariableSlotMap,
  hasValidatedUse,
  interfaceOwnedPickIssue,
  type VariableRoleMap,
} from '../../../codebook/variableRoles.ts';
import type { VariablePickerOption } from '../../../fields/VariablePickerField.tsx';
import {
  crossClassPickIssue,
  validatedElsewhereMessage,
  variableDisplayName,
} from '../../../form/arrayFields/crossClassPick.ts';
import type {
  CodebookSubject,
  ProtocolBuilderProtocolContext,
} from '../../../protocol-context.ts';
import { variablesForSubject } from '../../../protocol-context.ts';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import { narrativePedigreeMessages } from './narrativePedigreeMessages.ts';
import { sourceStageRecordedVariables } from './sourceStage.ts';

/** A disease is affected-or-not, so the attribute behind it is a boolean. */
const AFFECTED_TYPE = 'boolean';

/**
 * The two indexes a disease mapping is judged against: which attributes an
 * interface slot already owns, and which writer class already claims one.
 *
 * Built from the editor's own protocol context, so they follow a
 * collaborator's change without anything here re-fetching. There is no third,
 * draft-scoped index of the kind a Family Pedigree keeps: a narrative pedigree
 * has no slots and no form of its own, so the only claims it can conflict with
 * are ones the saved protocol already carries.
 */
export function useDiseaseVariableIndexes(): Readonly<{
  roleMap: VariableRoleMap;
  slotMap: ExclusiveVariableSlotMap;
}> {
  const protocolContext = useProtocolContext();
  return useMemo(
    () => ({
      roleMap: buildVariableRoleMap(protocolContext),
      slotMap: buildExclusiveVariableSlotMap(protocolContext),
    }),
    [protocolContext],
  );
}

export type DiseaseVariableInput = Readonly<{
  context: ProtocolBuilderProtocolContext;
  roleMap: VariableRoleMap;
  slotMap: ExclusiveVariableSlotMap;
  /** The node type the source pedigree collects, or `null` while there is none. */
  subject: CodebookSubject | null;
  /** Which pedigree this stage reads, so what it records can be read too. */
  sourceStageId: unknown;
  /** The attribute this row already holds, which is never taken away from it. */
  currentVariable?: string;
}>;

/**
 * The attributes a disease may be mapped to.
 *
 * Four exclusions, and every one of them is stated again in
 * {@link diseasePickIssue}, because the picker only decides what may be
 * CHOSEN: an attribute that stopped qualifying while the dialog was open, or a
 * row an import brought in, never went through the picker at all.
 *
 * What the second asking is FOR differs by where it is asked. In the dialog it
 * refuses the pick, which is the researcher's own decision being judged as
 * they make it. On a row already in the list — {@link diseaseRowIssue} — it
 * reports, and the stage still saves: what an attribute is, and whether it is
 * there at all, is the codebook's fact rather than this stage's, and a draft
 * is allowed to be invalid across sections while a researcher works out which
 * side to repair. Publication is where that is enforced.
 *
 * - The attribute has to be a boolean the source pedigree's node type has. A
 *   disease is drawn from an affected-or-not answer, and nothing else can
 *   carry one.
 * - It may not be one another interface slot owns. A pedigree derives its
 *   participant marker and its relationships from the tree the participant
 *   draws, so a disease mapped onto one would paint the participant as
 *   affected in every interview — which is why the protocol schema refuses it.
 * - It may not be one a form elsewhere collects. A disease mapping is an
 *   UNVALIDATED writer, so taking an attribute a form field validates would
 *   bypass that field's rules.
 * - It has to be one the source pedigree RECORDS — one a nomination prompt of
 *   it writes. An attribute nothing ever sets to `true` marks nobody, and the
 *   stage then draws an unmarked family with nothing to say why.
 *
 * `used` is the picker's own fifth exclusion and has no save-time twin here:
 * two rows on one attribute is a rule about the LIST, and the list's own gate
 * is where it is stated.
 */
export function diseaseVariableOptions(
  input: DiseaseVariableInput & Readonly<{ used: ReadonlySet<string> }>,
): VariablePickerOption[] {
  const { context, roleMap, slotMap, subject, sourceStageId, currentVariable } =
    input;
  if (subject === null) return [];
  const recorded = sourceStageRecordedVariables(context, sourceStageId);
  const pool = Object.entries(variablesForSubject(context, subject))
    .filter(
      ([variableId, variable]) =>
        variable.type === AFFECTED_TYPE &&
        (variableId === currentVariable ||
          (recorded.has(variableId) && !input.used.has(variableId))),
    )
    .map(([variableId, variable]) => ({
      value: variableId,
      label: variable.name,
      type: variable.type,
    }));

  const escape = currentVariable === undefined ? [] : [currentVariable];
  return excludeInterfaceOwned(
    slotMap,
    subject,
    excludeValidatedUses(roleMap, subject, pool, escape),
    escape,
  );
}

/**
 * Why a disease may not map the attribute it holds, or `undefined` when it
 * may.
 *
 * Asked in the order the researcher can act on: whether there is an attribute
 * there at all, then who else writes it, then whether anything records it.
 *
 * `committedVariable` is the mapping the SAVED stage already carries for this
 * row, found by the row's own id, and it escapes the last two rules only: a
 * conflict this edit did not introduce, and a nomination prompt a collaborator
 * has just deleted, are things to report on the list rather than reasons to
 * trap the researcher in a dialog they cannot close. It escapes nothing above
 * them, because an attribute that has gone or become something else is nobody's
 * authoring decision and nothing can be recorded under it.
 */
export function diseasePickIssue(
  input: DiseaseVariableInput &
    Readonly<{ variableId: unknown; committedVariable: string }>,
): string | undefined {
  const {
    context,
    roleMap,
    slotMap,
    subject,
    sourceStageId,
    variableId,
    committedVariable,
  } = input;
  if (subject === null) return undefined;
  if (typeof variableId !== 'string' || variableId === '') return undefined;

  const allVariables: Readonly<Variables> = variablesForSubject(
    context,
    subject,
  );
  const variable = allVariables[variableId];
  if (variable === undefined) {
    return createMessageError(narrativePedigreeMessages.diseaseVariableGone, {
      attributeName: variableId,
    });
  }
  if (variable.type !== AFFECTED_TYPE) {
    return createMessageError(
      narrativePedigreeMessages.diseaseVariableTypeChanged,
      { attributeName: variableDisplayName(allVariables, variableId) },
    );
  }

  const ownedIssue = interfaceOwnedPickIssue(slotMap, subject, variableId);
  if (ownedIssue !== undefined) return ownedIssue;

  const crossClass = crossClassPickIssue({
    variableId,
    originalVariableId: committedVariable,
    hasConflictingUse: (candidate) =>
      hasValidatedUse(roleMap, subject, candidate),
    allVariables,
    message: validatedElsewhereMessage,
  });
  if (crossClass !== undefined) return crossClass;

  if (
    variableId !== committedVariable &&
    !sourceStageRecordedVariables(context, sourceStageId).has(variableId)
  ) {
    return createMessageError(narrativePedigreeMessages.diseasesNotRecorded);
  }
  return undefined;
}

/**
 * What is wrong with the attribute a row in the list ALREADY holds, or
 * `undefined` when nothing is.
 *
 * {@link diseasePickIssue} asked with the row's own attribute as both the pick
 * and the committed mapping, which leaves exactly the rules a researcher
 * cannot have broken from inside this stage: the attribute deleted, re-typed,
 * or claimed by one of the pedigree's own interface slots. Everything the
 * committed value escapes there — a form elsewhere validating it, a nomination
 * prompt that no longer records it — is escaped here for the same reason it is
 * escaped in the dialog, and the list's own gate is what reports the second of
 * them.
 *
 * Answering from the row rather than from the picker is the whole point: no
 * pick is being made, so the only way these three ever reach a researcher is
 * for the row to say so where it sits.
 */
export function diseaseRowIssue(
  input: DiseaseVariableInput & Readonly<{ variableId: unknown }>,
): string | undefined {
  return diseasePickIssue({
    ...input,
    committedVariable:
      typeof input.variableId === 'string' ? input.variableId : '',
  });
}
