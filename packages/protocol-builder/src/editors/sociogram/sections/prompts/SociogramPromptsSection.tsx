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
import {
  type CodebookSubject,
  variablesForSubject,
} from '../../../../protocol-context.ts';
import { asText } from '../../../../sections/canvas/rowValues.ts';
import PromptsSection from '../../../../sections/PromptsSection.tsx';
import { useStageNodeTypes } from '../../../../sections/useStageSubject.ts';
import { useProtocolContext } from '../../../../state/protocolContext.ts';
import { useDraftSociogram } from '../useDraftSociogram.ts';
import {
  highlightFieldName,
  NODE_TYPE_ORDER_FIELD,
  SociogramPromptFields,
  SociogramPromptPreview,
  sortFieldName,
  TASK_FIELD,
} from './SociogramPromptFields.tsx';
import { sociogramPromptMessages as messages } from './sociogramPromptMessages.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const recordsOf = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

/** The entry of a saved list that is about `type`, if there is one. */
const entryForType = (
  entries: unknown,
  type: string,
): Record<string, unknown> | undefined =>
  recordsOf(entries).find((entry) => entry.type === type);

/** The attribute a saved highlight task marks on nodes of `type`. */
const savedHighlightFor = (highlight: unknown, type: string): string =>
  asText(entryForType(highlight, type)?.variable) ?? '';

/**
 * Opens a prompt with each node type's highlight attribute and sort rules in
 * that type's own dialog fields, so each picker edits one value and each sort
 * group edits one type's rules rather than the saved lists of every type.
 */
const expandPromptFor =
  (types: readonly string[]) =>
  (row: RowValues): RowValues => {
    // Until the stage has a node type, its rules stay as they are for the
    // one sort group that waits for it.
    if (types.length === 0) return row;
    const { sortOrder, ...rest } = row;
    const expanded: RowValues = { ...rest };
    types.forEach((type, index) => {
      const variable = asText(entryForType(row.highlight, type)?.variable);
      if (variable !== undefined) {
        expanded[highlightFieldName(index)] = variable;
      }
      const rules = recordsOf(sortOrder).filter((rule) => rule.type === type);
      if (rules.length > 0) expanded[sortFieldName(index)] = rules;
    });
    return expanded;
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
  const types = useStageNodeTypes();
  const draft = useDraftSociogram();

  // This stage's own committed uses are excluded, exactly as the picker's are:
  // the attribute a prompt is already holding is claimed BY that prompt, and
  // counting the claim would make the stage refuse to re-save itself.
  const roleMap = useMemo(
    () => buildVariableRoleMap(protocolContext, identity.id),
    [identity.id, protocolContext],
  );

  /**
   * The attribute this row's SAVED highlight task marks on nodes of `type`.
   *
   * Read from the stage as the protocol last stored it: only a pick that the
   * protocol already contains is a conflict this edit did not introduce, and
   * a researcher cannot be asked to repair this stage by editing a form in
   * another stage.
   */
  const savedMarkFor = useCallback(
    (rowId: unknown, type: string): string => {
      if (typeof rowId !== 'string') return '';
      const row = recordsOf(savedFields.prompts).find(
        (candidate) => candidate.id === rowId,
      );
      if (row?.task !== 'highlight') return '';
      return savedHighlightFor(row.highlight, type);
    },
    [savedFields],
  );

  const beforeSave = useCallback(
    (row: RowValues, context: RowSaveContext): RowSaveOutcome => {
      if (types.length === 0) return { row };
      if (row[TASK_FIELD] !== 'highlight') return { row };

      const fieldErrors: Record<string, string> = {};
      types.forEach((type, index) => {
        const field = highlightFieldName(index);
        const pick = asText(row[field]);
        if (pick === undefined) return;
        const subject: CodebookSubject = { entity: 'node', type };
        const issue = crossClassPickIssue({
          variableId: pick,
          originalVariableId: savedMarkFor(context.openedOn.id, type),
          hasConflictingUse: (variableId) =>
            hasValidatedUse(roleMap, subject, variableId),
          allVariables: variablesForSubject(protocolContext, subject),
          message: validatedElsewhereMessage,
        });
        if (issue !== undefined) fieldErrors[field] = issue;
      });
      // A single type's picker is required by its own field; on a stage that
      // shows several, each is optional but the prompt must mark something.
      const picked = types.some(
        (_type, index) => asText(row[highlightFieldName(index)]) !== undefined,
      );
      if (types.length > 1 && !picked) {
        fieldErrors[highlightFieldName(0)] = intl.formatMessage(
          messages.promptHighlightRequiredSeveral,
        );
      }
      return Object.keys(fieldErrors).length === 0
        ? { row }
        : { refused: { fieldErrors } };
    },
    [intl, protocolContext, roleMap, savedMarkFor, types],
  );

  const expand = useMemo(() => expandPromptFor(types), [types]);

  /**
   * The saved shape of a prompt: only the fields of its own task. Fields of a
   * task the researcher switched away from are dropped. A highlight task gets
   * an entry for each node type it marks, the sort rules of every type are
   * joined into one list with each rule naming its type, and the order of the
   * node types is kept only on a stage that shows several.
   */
  const collapseRow = useCallback(
    (row: unknown): unknown => {
      if (!isRecord(row)) return row;
      // The first highlight field goes whether or not the stage has a type
      // yet: it is the dialog's, never the saved prompt's.
      const perTypeFields = new Set([
        highlightFieldName(0),
        ...types.flatMap((_type, index) => [
          highlightFieldName(index),
          sortFieldName(index),
        ]),
      ]);
      const {
        highlight,
        edges,
        [NODE_TYPE_ORDER_FIELD]: nodeTypeOrder,
        ...others
      } = row;
      const rest = Object.fromEntries(
        Object.entries(others).filter(([key]) => !perTypeFields.has(key)),
      );
      const task = rest[TASK_FIELD];
      const display = isRecord(edges) ? edges.display : undefined;
      const create = isRecord(edges) ? edges.create : undefined;
      const keptEdges = {
        ...(display === undefined ? {} : { display }),
        ...(task === 'connect' && create !== undefined ? { create } : {}),
      };
      const highlightEntries = types.flatMap((type, index) => {
        const variable = asText(row[highlightFieldName(index)]);
        if (variable === undefined) return [];
        return [
          {
            id:
              asText(entryForType(highlight, type)?.id) ??
              createProtocolObjectId(),
            type,
            variable,
          },
        ];
      });
      const sortOrder = types.flatMap((type, index) =>
        recordsOf(row[sortFieldName(index)]).map((rule) => ({
          id: asText(rule.id) ?? createProtocolObjectId(),
          type,
          property: rule.property,
          direction: rule.direction,
        })),
      );
      // A kept order names every type the stage shows, as the order list
      // displays it: the saved order's shown types, then the rest in subject
      // order.
      const saved = Array.isArray(nodeTypeOrder)
        ? nodeTypeOrder.filter(
            (type): type is string =>
              typeof type === 'string' && types.includes(type),
          )
        : [];
      const order =
        saved.length === 0
          ? []
          : [...saved, ...types.filter((type) => !saved.includes(type))];
      return {
        ...rest,
        ...(Object.keys(keptEdges).length === 0 ? {} : { edges: keptEdges }),
        ...(task === 'highlight' && highlightEntries.length > 0
          ? { highlight: highlightEntries }
          : {}),
        ...(sortOrder.length === 0 ? {} : { sortOrder }),
        ...(order.length > 1 ? { [NODE_TYPE_ORDER_FIELD]: order } : {}),
      };
    },
    [types],
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
      expand={expand}
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
