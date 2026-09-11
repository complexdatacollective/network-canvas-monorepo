import { useCallback, useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';

import {
  buildVariableRoleMap,
  hasValidatedUse,
} from '../../../codebook/variableRoles.ts';
import { geospatialMessages as messages } from '../../../fields/geospatial/geospatialMessages.ts';
import {
  crossClassPickIssue,
  validatedElsewhereMessage,
} from '../../../form/arrayFields/crossClassPick.ts';
import type {
  RowSaveContext,
  RowSaveOutcome,
  RowValues,
} from '../../../form/rowDialog.tsx';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import { variablesForSubject } from '../../../protocol-context.ts';
import { asText } from '../../../sections/canvas/rowValues.ts';
import PromptsSection from '../../../sections/PromptsSection.tsx';
import { useStageSubject } from '../../../sections/useStageSubject.ts';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import {
  GeospatialPromptFields,
  GeospatialPromptPreview,
  PROMPTS_FIELD,
  promptsOf,
  promptVariableOf,
  VARIABLE_FIELD,
} from './GeospatialPromptFields.tsx';

/**
 * The places a geospatial stage asks about.
 *
 * The package's shared prompt list with this interface's own row: a question,
 * and the location attribute the answer is stored in. Everything a prompt list
 * has in common with every other one — its ordering, its identity per row, its
 * rule that a stage must ask something — belongs to `PromptsSection` and is
 * not repeated here.
 *
 * The four sentences handed down are descriptors, not strings: a prompt here
 * asks WHERE something is and records the answer in one location attribute,
 * which the shared wording does not say.
 */
export default function GeospatialPromptsSection() {
  const intl = useAppIntl();
  const prompts = useStageValue(PROMPTS_FIELD);
  const { committedFields, identity } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const subject = useStageSubject('node');

  // This stage's own uses are left out, so a stage can re-save itself.
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
   * The location attribute this row was SAVED with, where it had one.
   *
   * Read from the stage the editor opened on rather than from the row the
   * dialog opened on: the two differ once a prompt has been edited more than
   * once before the stage is saved, and only the saved value keeps a conflict
   * the protocol ALREADY carries saveable. A researcher cannot be asked to
   * repair this stage by editing a form in a stage they may not be able to
   * reach.
   */
  const savedVariableFor = useCallback(
    (rowId: unknown): string => {
      const saved: unknown = committedFields[PROMPTS_FIELD];
      if (!Array.isArray(saved) || typeof rowId !== 'string') return '';
      const row = saved.find(
        (candidate) =>
          typeof candidate === 'object' &&
          candidate !== null &&
          Reflect.get(candidate, 'id') === rowId,
      );
      return promptVariableOf(row) ?? '';
    },
    [committedFields],
  );

  /**
   * The save-time half of the two rules the row's own picker already applies.
   *
   * The second is the cross-class one: the interview writes what the
   * participant taps straight into the prompt's attribute, around whatever
   * validation the codebook holds for it, so an attribute a form elsewhere
   * COLLECTS may not also be written here — an export would otherwise mix
   * checked and unchecked answers under one name. The picker never offers such
   * an attribute, and filtering alone is not enough: a conflict that arrives
   * with an imported protocol, or one a collaborator creates while this dialog
   * is open, is never picked here at all and would save in silence. A pick the
   * stage was already saved with escapes, so a protocol that arrives carrying
   * the conflict can still be re-saved from the stage that has to resolve it.
   *
   * The interview writes each answer into the prompt's own attribute, so two
   * prompts sharing one leave the stage holding only the last place the
   * participant chose — a loss nothing downstream can report, because the
   * protocol schema is satisfied by both prompts naming a location attribute.
   * The picker stops a researcher choosing one; this stops a row that is
   * HOLDING one from being saved, which is the state a protocol authored
   * elsewhere arrives in and the one place it can be resolved.
   *
   * No unchanged-pick escape, for that reason: re-saving the row as it stands
   * would keep both prompts pointed at one attribute, so the researcher is
   * asked to settle it here rather than told about it and let past.
   */
  const beforeSave = useCallback(
    (row: RowValues, context: RowSaveContext): RowSaveOutcome => {
      const variable = asText(row[VARIABLE_FIELD]);
      if (variable === undefined) return { row };

      const shared = promptsOf(prompts).some(
        (prompt, index) =>
          index !== context.editIndex && promptVariableOf(prompt) === variable,
      );
      if (shared) {
        return {
          refused: {
            fieldErrors: {
              [VARIABLE_FIELD]: intl.formatMessage(
                messages.promptVariableDuplicateRefusal,
              ),
            },
          },
        };
      }

      if (subject === undefined) return { row };
      const issue = crossClassPickIssue({
        variableId: variable,
        originalVariableId: savedVariableFor(context.openedOn.id),
        hasConflictingUse: (variableId) =>
          hasValidatedUse(roleMap, subject, variableId),
        allVariables,
        message: validatedElsewhereMessage,
      });
      return issue === undefined
        ? { row }
        : { refused: { fieldErrors: { [VARIABLE_FIELD]: issue } } };
    },
    [allVariables, intl, prompts, roleMap, savedVariableFor, subject],
  );

  return (
    <PromptsSection
      PromptEditor={GeospatialPromptFields}
      PromptPreview={GeospatialPromptPreview}
      beforeSave={beforeSave}
      description={messages.promptsDescription}
      waitingDescription={messages.promptsWaitingDescription}
      fieldHint={messages.promptsFieldHint}
      emptyState={messages.promptsEmptyState}
    />
  );
}
