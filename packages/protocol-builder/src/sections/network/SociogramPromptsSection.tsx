import { useCallback, useMemo } from 'react';

import {
  buildVariableRoleMap,
  hasValidatedUse,
} from '../../codebook/variableRoles.ts';
import {
  crossClassPickIssue,
  validatedElsewhereMessage,
} from '../../form/arrayFields/crossClassPick.ts';
import type { DialogArrayEditorValidate } from '../../form/arrayFields/DialogArrayField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import PromptsSection from '../PromptsSection.tsx';
import { useStageSubject, useSubjectVariables } from './codebookOptions.ts';
import { networkCanvasMessages } from './networkCanvasMessages.ts';
import { asNestedText } from './rowValues.ts';
import {
  HIGHLIGHT_VARIABLE_FIELD,
  SociogramPromptFields,
  SociogramPromptPreview,
} from './SociogramPromptFields.tsx';

const PROMPTS_FIELD = 'prompts';

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
 * The four sentences handed down are descriptors, not strings: the shared
 * section is worded for a question the participant answers, and a sociogram's
 * prompts set TASKS performed on a canvas — a difference a translator has to
 * be shown rather than left to infer from a section they never see.
 *
 * What it adds of its own is the save-time half of one rule the picker inside
 * the dialog already applies: a prompt that lets the participant TAP an
 * attribute writes it without checking it, so it may not take one a form
 * collects. The picker never offers such an attribute, and that is not enough
 * on its own — the codebook reaches this editor live, so a collaborator adding
 * a form field on the attribute this dialog is holding drops it from the
 * option list while the pick stays in the form, and the row closed on a
 * validated/unvalidated writer conflict the protocol then refuses.
 */
export default function SociogramPromptsSection() {
  const { committedFields, protocolContext, identity } = useStageEditorForm();
  const subject = useStageSubject();
  const allVariables = useSubjectVariables(subject);

  // This stage's own committed uses are excluded, exactly as the picker's are:
  // the attribute a prompt is already holding is claimed BY that prompt, and
  // counting the claim would make the stage refuse to re-save itself.
  const roleMap = useMemo(
    () => buildVariableRoleMap(protocolContext, identity.id),
    [identity.id, protocolContext],
  );

  /**
   * This row's own SAVED attribute, found by the row's stable id.
   *
   * The id comes from the row this dialog session opened on and the value from
   * the committed prompts, which is the anchor `NominationPromptsSection`
   * settled on: the row on screen and the row the protocol holds differ once a
   * prompt has been edited more than once in one unsaved session, and only the
   * committed value keeps an attribute the protocol ALREADY binds here
   * saveable. A researcher cannot be asked to repair this stage by editing a
   * form in another one they may not be able to reach.
   */
  const committedHighlightFor = useCallback(
    (rowId: unknown): string => {
      const committed: unknown = committedFields[PROMPTS_FIELD];
      if (!Array.isArray(committed) || typeof rowId !== 'string') return '';
      const row = committed.find(
        (candidate) => isRecord(candidate) && candidate.id === rowId,
      );
      return (
        asNestedText(isRecord(row) ? row.highlight : undefined, 'variable') ??
        ''
      );
    },
    [committedFields],
  );

  const editorValidate = useCallback<DialogArrayEditorValidate>(
    (values, context) => {
      if (subject === undefined) return {};
      // A pick is only here when the dialog is showing the marking control,
      // which is the dialog's own way of saying the participant will WRITE
      // this attribute: the row arrives holding the fields that are mounted,
      // and a prompt that merely colours its nodes by an attribute renders no
      // picker for it at all. `allowHighlighting` cannot be asked instead —
      // nothing renders it, so it reaches the saved row from the store's
      // dormant entries rather than through here.
      const pick = asNestedText(values.highlight, 'variable');
      if (pick === undefined) return {};

      const issue = crossClassPickIssue({
        variableId: pick,
        originalVariableId: committedHighlightFor(
          isRecord(context?.initialValues)
            ? context.initialValues.id
            : undefined,
        ),
        hasConflictingUse: (variableId) =>
          hasValidatedUse(roleMap, subject, variableId),
        allVariables,
        message: validatedElsewhereMessage,
      });
      return issue === undefined ? {} : { [HIGHLIGHT_VARIABLE_FIELD]: issue };
    },
    [allVariables, committedHighlightFor, roleMap, subject],
  );

  return (
    <PromptsSection
      PromptEditor={SociogramPromptFields}
      PromptPreview={SociogramPromptPreview}
      editorValidate={editorValidate}
      description={networkCanvasMessages.sociogramPromptsDescription}
      waitingDescription={
        networkCanvasMessages.sociogramPromptsWaitingDescription
      }
      fieldHint={networkCanvasMessages.sociogramPromptsFieldHint}
      emptyState={networkCanvasMessages.sociogramPromptsEmptyState}
    />
  );
}
