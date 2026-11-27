import { useCallback, useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import {
  createProtocolObjectId,
  isFirstStageUsingLayout,
  type Stage,
} from '@codaco/protocol-validation';

import {
  buildVariableRoleMap,
  hasValidatedUse,
} from '../../../../codebook/variableRoles.ts';
import { stagePlacement } from '../../../../fields/stageDestination.ts';
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
import { asText } from '../../../../sections/canvas/rowValues.ts';
import PromptsSection from '../../../../sections/PromptsSection.tsx';
import { useStageSubject } from '../../../../sections/useStageSubject.ts';
import { useProtocolContext } from '../../../../state/protocolContext.ts';
import { useDraftSociogram } from '../useDraftSociogram.ts';
import {
  firstHighlightVariable,
  HIGHLIGHT_VARIABLE_FIELD,
  SociogramPromptFields,
  SociogramPromptPreview,
  TASK_FIELD,
} from './SociogramPromptFields.tsx';
import { sociogramPromptMessages as messages } from './sociogramPromptMessages.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The highlight entry id a saved prompt already has, kept across saves. */
const firstHighlightId = (highlight: unknown): string | undefined => {
  if (!Array.isArray(highlight)) return undefined;
  const [first]: unknown[] = highlight;
  return isRecord(first) ? asText(first.id) : undefined;
};

/**
 * Opens a prompt with its highlight attribute in the dialog's own field, so the
 * picker edits one value rather than the saved list of entries.
 */
const expandPrompt = (row: RowValues): RowValues => {
  const variable = firstHighlightVariable(row.highlight);
  return variable === undefined
    ? row
    : { ...row, [HIGHLIGHT_VARIABLE_FIELD]: variable };
};

/**
 * The stage order with the stage being edited as it stands: an existing stage
 * replaced in place, and a stage being created inserted where the host is
 * about to put it.
 */
const withDraftInPlace = (
  stages: readonly Stage[],
  draft: Stage,
  position: number | undefined,
): Stage[] => {
  const { index, isNew } = stagePlacement(stages, draft.id, position);
  return isNew
    ? [...stages.slice(0, index), draft, ...stages.slice(index)]
    : stages.map((stage, at) => (at === index ? draft : stage));
};

/**
 * The tasks this sociogram sets, in order.
 *
 * The list, its ordering, its dialog and its rule that a stage must ask
 * something are the package's shared prompt section. This section adds the
 * shape of a saved prompt, which depends on its task, the check that a
 * highlight task does not mark an attribute a form collects, and a warning
 * when no node can have been placed before this stage's first prompt.
 */
export default function SociogramPromptsSection() {
  const intl = useAppIntl();
  const { savedFields, identity, creation } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const subject = useStageSubject('node');
  const subjectType = subject?.entity === 'node' ? subject.type : undefined;
  const draft = useDraftSociogram();

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
   * The attribute this row's SAVED highlight task marks.
   *
   * Read from the stage as the protocol last stored it: only a pick that the
   * protocol already contains is a conflict this edit did not introduce, and
   * a researcher cannot be asked to repair this stage by editing a form in
   * another stage.
   */
  const savedMarkFor = useCallback(
    (rowId: unknown): string => {
      const saved: unknown = savedFields.prompts;
      if (!Array.isArray(saved) || typeof rowId !== 'string') return '';
      const row = saved.find(
        (candidate) => isRecord(candidate) && candidate.id === rowId,
      );
      if (!isRecord(row) || row.task !== 'highlight') return '';
      return firstHighlightVariable(row.highlight) ?? '';
    },
    [savedFields],
  );

  const beforeSave = useCallback(
    (row: RowValues, context: RowSaveContext): RowSaveOutcome => {
      if (subject === undefined) return { row };
      if (row[TASK_FIELD] !== 'highlight') return { row };
      const pick = asText(row[HIGHLIGHT_VARIABLE_FIELD]);
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

  /**
   * The saved shape of a prompt: only the fields of its own task. Fields of a
   * task the researcher switched away from are dropped, and a highlight task
   * gets its one entry for the stage's node type.
   */
  const collapseRow = useCallback(
    (row: unknown): unknown => {
      if (!isRecord(row)) return row;
      const {
        [HIGHLIGHT_VARIABLE_FIELD]: highlightVariable,
        highlight,
        edges,
        ...rest
      } = row;
      const task = rest[TASK_FIELD];
      const display = isRecord(edges) ? edges.display : undefined;
      const create = isRecord(edges) ? edges.create : undefined;
      const keptEdges = {
        ...(display === undefined ? {} : { display }),
        ...(task === 'connect' && create !== undefined ? { create } : {}),
      };
      const variable = asText(highlightVariable);
      return {
        ...rest,
        ...(Object.keys(keptEdges).length === 0 ? {} : { edges: keptEdges }),
        ...(task === 'highlight' &&
        variable !== undefined &&
        subjectType !== undefined
          ? {
              highlight: [
                {
                  id: firstHighlightId(highlight) ?? createProtocolObjectId(),
                  type: subjectType,
                  variable,
                },
              ],
            }
          : {}),
      };
    },
    [subjectType],
  );

  const itemTemplate = useCallback(() => ({ [TASK_FIELD]: 'layout' }), []);

  const automaticLayout =
    draft?.type === 'Sociogram' && draft.behaviours?.automaticLayout === true;
  const firstPrompt =
    draft?.type === 'Sociogram' ? draft.prompts[0] : undefined;
  const showFirstUseAlert =
    draft?.type === 'Sociogram' &&
    firstPrompt !== undefined &&
    firstPrompt.task !== 'layout' &&
    !automaticLayout &&
    isFirstStageUsingLayout(
      {
        codebook: protocolContext.codebook,
        stages: withDraftInPlace(
          protocolContext.orderedStages,
          draft,
          creation?.position,
        ),
      },
      draft.id,
      draft.layout,
    );

  return (
    <PromptsSection
      PromptEditor={SociogramPromptFields}
      PromptPreview={SociogramPromptPreview}
      beforeSave={beforeSave}
      expand={expandPrompt}
      collapseRow={collapseRow}
      itemTemplate={itemTemplate}
      description={messages.sociogramPromptsDescription}
      waitingDescription={messages.sociogramPromptsWaitingDescription}
      fieldHint={messages.sociogramPromptsFieldHint}
    >
      {showFirstUseAlert && (
        <Alert variant="warning">
          <AlertTitle>{intl.formatMessage(messages.firstUseTitle)}</AlertTitle>
          <AlertDescription>
            {intl.formatMessage(messages.firstUseDescription)}
          </AlertDescription>
        </Alert>
      )}
    </PromptsSection>
  );
}
