import { useCallback, useMemo } from 'react';

import {
  buildVariableRoleMap,
  hasValidatedUse,
} from '../../../../codebook/variableRoles.ts';
import {
  crossClassPickIssue,
  validatedElsewhereMessage,
} from '../../../../form/arrayFields/crossClassPick.ts';
import type {
  RowSaveContext,
  RowSaveOutcome,
  RowValues,
} from '../../../../form/rowDialog.tsx';
import { useStageEditorForm } from '../../../../form/stageEditorContext.ts';
import { variablesForSubject } from '../../../../protocol-context.ts';
import {
  asNestedBoolean,
  asNestedText,
} from '../../../../sections/canvas/rowValues.ts';
import PromptsSection from '../../../../sections/PromptsSection.tsx';
import { useStageSubject } from '../../../../sections/useStageSubject.ts';
import { useProtocolContext } from '../../../../state/protocolContext.ts';
import {
  HIGHLIGHT_VARIABLE_FIELD,
  SociogramPromptFields,
  SociogramPromptPreview,
} from './SociogramPromptFields.tsx';
import { sociogramPromptMessages as messages } from './sociogramPromptMessages.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The tasks this sociogram sets, in order.
 *
 * The list, its ordering, its dialog and its rule that a stage must ask
 * something are the package's shared prompt section; everything this interface
 * adds is inside the row dialog — where the nodes are remembered, which
 * connections are drawn, and what tapping a node does.
 *
 * What it adds of its own is the save-time half of one rule the picker inside
 * the dialog already applies: a prompt that lets the participant TAP an
 * attribute writes it without checking it, so it may not take one a form
 * collects. The picker never offers such an attribute, and that is not enough
 * on its own — the codebook is read live, so a collaborator adding a form
 * field on the attribute this dialog is holding drops it from the option list
 * while the pick stays in the form, and the row would close on a
 * validated/unvalidated writer conflict the protocol then refuses.
 */
export default function SociogramPromptsSection() {
  const { committedFields, identity } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const subject = useStageSubject('node');

  // This stage's own committed uses are excluded, exactly as the picker's are:
  // the attribute a prompt is already holding is claimed BY that prompt, and
  // counting the claim would make the stage refuse to re-save itself.
  const roleMap = useMemo(
    () => buildVariableRoleMap(protocolContext, identity.id),
    [identity.id, protocolContext],
  );
  const allVariables = useMemo(
    () =>
      subject === undefined
        ? {}
        : variablesForSubject(protocolContext, subject),
    [protocolContext, subject],
  );

  /**
   * This row's own SAVED attribute, where the saved row already marked with it.
   *
   * Read from the stage the editor opened on rather than from the row the
   * dialog opened on: the two differ once a prompt has been edited more than
   * once before the stage is saved, and only the saved value keeps an
   * attribute the protocol ALREADY binds here saveable. A researcher cannot be
   * asked to repair this stage by editing a form in another one they may not
   * be able to reach.
   *
   * `allowHighlighting` is what makes the saved prompt a writer, and only a
   * saved writer's pick is a conflict this edit did not introduce. A prompt
   * that merely HIGHLIGHTS its nodes by the attribute reads it and writes
   * nothing, so a form is free to collect the same one — and switching that
   * prompt to "mark the node" turns the very same id into an unvalidated
   * writer of an attribute something else validates.
   */
  const savedMarkFor = useCallback(
    (rowId: unknown): string => {
      const saved: unknown = committedFields.prompts;
      if (!Array.isArray(saved) || typeof rowId !== 'string') return '';
      const row = saved.find(
        (candidate) => isRecord(candidate) && candidate.id === rowId,
      );
      const highlight = isRecord(row) ? row.highlight : undefined;
      if (asNestedBoolean(highlight, 'allowHighlighting') !== true) return '';
      return asNestedText(highlight, 'variable') ?? '';
    },
    [committedFields],
  );

  const beforeSave = useCallback(
    (row: RowValues, context: RowSaveContext): RowSaveOutcome => {
      if (subject === undefined) return { row };
      // Only a prompt that MARKS is judged, and `allowHighlighting` is what
      // says so — never `variable`, which a prompt that merely highlights
      // its nodes carries too. The flag is also what puts the marking picker
      // on screen, so a refusal has a control to land on: a highlighting
      // renders no picker at all, and a refusal aimed at that path would be
      // one no field owns and nothing renders — the dialog would refuse to
      // close with nothing on screen to say why, and only Cancel would
      // escape. A form collecting the attribute is no conflict for a prompt
      // that only READS it, which is the other half of the same fact.
      //
      // The row carries the value either way: a field the dialog is not
      // showing is put back where it belongs when the submit assembles the
      // row, so reading the row cannot tell the two configurations apart.
      if (asNestedBoolean(row.highlight, 'allowHighlighting') !== true) {
        return { row };
      }
      const pick = asNestedText(row.highlight, 'variable');
      if (pick === undefined) return { row };

      const issue = crossClassPickIssue({
        variableId: pick,
        originalVariableId: savedMarkFor(context.openedOn.id),
        hasConflictingUse: (variableId) =>
          hasValidatedUse(roleMap, subject, variableId),
        allVariables,
        message: validatedElsewhereMessage,
      });
      return issue === undefined
        ? { row }
        : { refused: { fieldErrors: { [HIGHLIGHT_VARIABLE_FIELD]: issue } } };
    },
    [allVariables, roleMap, savedMarkFor, subject],
  );

  return (
    <PromptsSection
      PromptEditor={SociogramPromptFields}
      PromptPreview={SociogramPromptPreview}
      beforeSave={beforeSave}
      description={messages.sociogramPromptsDescription}
      waitingDescription={messages.sociogramPromptsWaitingDescription}
      fieldHint={messages.sociogramPromptsFieldHint}
    />
  );
}
