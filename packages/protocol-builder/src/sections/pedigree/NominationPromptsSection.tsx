import { get } from 'es-toolkit/compat';
import { useCallback, useMemo } from 'react';

import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import {
  hasValidatedUse,
  interfaceOwnedPickIssue,
} from '../../codebook/variableRoles.ts';
import { withoutAbsentValues } from '../../form/absentValues.ts';
import {
  crossClassPickIssue,
  validatedElsewhereMessage,
} from '../../form/arrayFields/crossClassPick.ts';
import DialogArrayField from '../../form/arrayFields/DialogArrayField.tsx';
import ProtocolArrayField from '../../form/ProtocolArrayField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import { variablesForSubject } from '../../protocol-context.ts';
import BuilderSection from '../BuilderSection.tsx';
import { useRowRenderers } from '../rowRenderers.tsx';
import { usePedigreeVariableIndexes } from './entityTypeReset.ts';
import {
  NominationPromptEditor,
  NominationPromptPreview,
} from './NominationPromptRow.tsx';

const PROMPTS_FIELD = 'nominationPrompts';
const NODE_TYPE_FIELD = 'nodeConfig.type';

const AT_LEAST_ONE_PROMPT =
  'Add at least one nomination prompt, or switch this section off.';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type NominationPromptsCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  /**
   * Said instead of `description` while the section is waiting on a node type,
   * so the outline's "not available yet" has an explanation beside it.
   */
  waitingDescription: string;
  fieldLabel: string;
  fieldHint: string;
  /** Visible text and accessible name of the add button. */
  addButtonLabel: string;
  addTitle: string;
  editorTitle: string;
  /** Noun used in row affordances ("Edit nomination prompt"). */
  itemLabel: string;
  emptyStateMessage: string;
}>;

const DEFAULT_COPY: NominationPromptsCopy = {
  sectionTitle: 'Nomination prompts',
  description:
    'Optionally ask the participant to mark family members who share a condition or trait.',
  waitingDescription:
    'Choose a node type before writing this pedigree’s nomination prompts.',
  fieldLabel: 'Nomination prompts',
  fieldHint:
    'The participant answers each of these across the whole family, in this order. Drag to reorder them.',
  addButtonLabel: 'Create new nomination prompt',
  addTitle: 'Create nomination prompt',
  editorTitle: 'Edit nomination prompt',
  itemLabel: 'nomination prompt',
  emptyStateMessage:
    'No nomination prompts yet. Create one to ask the participant to mark family members.',
};

export type NominationPromptsSectionProps = Readonly<{
  copy?: Partial<NominationPromptsCopy>;
}>;

/**
 * The optional questions the pedigree asks about every family member at once.
 *
 * A capability rather than a required list: a pedigree that only draws the
 * family is a complete pedigree, and the schema spells "this stage does not do
 * this" as the key's absence — so switching the section off removes it rather
 * than leaving an empty array behind.
 *
 * Each prompt writes its attribute through a per-person toggle the participant
 * operates, which makes it an UNVALIDATED writer. Two rules follow, and they
 * are enforced twice each — once by the picker, which never offers a refused
 * attribute, and once here at save time, which is what catches a draft that
 * predates the rule or an imported protocol that never met it:
 *
 * 1. it may not take an attribute a form elsewhere collects, whose validation
 *    the toggle would bypass; and
 * 2. it may never take one the pedigree itself derives — the participant
 *    marker above all — and that rule has NO unchanged-pick escape, because
 *    re-saving such a prompt would go on overwriting the marker.
 *
 * The escape for rule 1 is anchored to the stage's own COMMITTED prompts,
 * found BY ROW ID rather than by the row the dialog opened on. The two differ
 * once a prompt has been edited more than once in a single unsaved session,
 * and only the committed anchor keeps an attribute the protocol ALREADY binds
 * here saveable.
 */
export default function NominationPromptsSection({
  copy,
}: NominationPromptsSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };
  const { committedFields, protocolContext } = useStageEditorForm();
  const { roleMap, slotMap } = usePedigreeVariableIndexes();
  const nodeType = useStageValue(NODE_TYPE_FIELD);
  const waiting = typeof nodeType !== 'string';

  const subject: CodebookSubject | null = useMemo(
    () =>
      typeof nodeType === 'string' ? { entity: 'node', type: nodeType } : null,
    [nodeType],
  );

  const allVariables = useMemo(
    () =>
      subject === null ? {} : variablesForSubject(protocolContext, subject),
    [protocolContext, subject],
  );

  /** This row's own saved attribute, found by the row's stable id. */
  const committedVariableFor = useCallback(
    (rowId: unknown): string => {
      const committed: unknown = get(committedFields, PROMPTS_FIELD);
      if (!Array.isArray(committed) || typeof rowId !== 'string') return '';
      const row = committed.find(
        (candidate) => isRecord(candidate) && candidate.id === rowId,
      );
      const variable = isRecord(row) ? row.variable : undefined;
      return typeof variable === 'string' ? variable : '';
    },
    [committedFields],
  );

  const onBeforeSave = useCallback(
    (value: unknown) => {
      if (subject === null || !isRecord(value)) return value;
      const variable = typeof value.variable === 'string' ? value.variable : '';

      const ownedIssue = interfaceOwnedPickIssue(slotMap, subject, variable);
      if (ownedIssue !== undefined) {
        return { success: false, fieldErrors: { variable: [ownedIssue] } };
      }

      const issue = crossClassPickIssue({
        variableId: variable,
        originalVariableId: committedVariableFor(value.id),
        hasConflictingUse: (variableId) =>
          hasValidatedUse(roleMap, subject, variableId),
        allVariables,
        message: validatedElsewhereMessage,
      });
      if (issue !== undefined) {
        return { success: false, fieldErrors: { variable: [issue] } };
      }
      return value;
    },
    [allVariables, committedVariableFor, roleMap, slotMap, subject],
  );

  const promptsValidation = useMemo(
    () => ({
      custom: messageRuleValidation([
        (value: unknown) =>
          Array.isArray(value) && value.length > 0
            ? undefined
            : AT_LEAST_ONE_PROMPT,
      ]),
    }),
    [],
  );

  const { editorFieldsComponent, previewComponent } = useRowRenderers(
    NominationPromptEditor,
    NominationPromptPreview,
  );

  return (
    <BuilderSection
      title={words.sectionTitle}
      description={waiting ? words.waitingDescription : words.description}
      disabled={waiting}
      capability={{
        fields: [PROMPTS_FIELD],
        confirmClear: {
          title: 'This will delete your nomination prompts',
          description:
            'Every prompt you have written here will be removed, and participants will no longer be asked to mark family members.',
          confirmLabel: 'Delete the prompts',
        },
      }}
    >
      <ProtocolArrayField<typeof DialogArrayField>
        name={PROMPTS_FIELD}
        label={words.fieldLabel}
        hint={words.fieldHint}
        component={DialogArrayField}
        addButtonLabel={words.addButtonLabel}
        addTitle={words.addTitle}
        editorTitle={words.editorTitle}
        itemLabel={words.itemLabel}
        emptyStateMessage={words.emptyStateMessage}
        editorFieldsComponent={editorFieldsComponent}
        previewComponent={previewComponent}
        editorDialogSize="editor"
        normalizeItem={withoutAbsentValues}
        onBeforeSave={onBeforeSave}
        sortable
        {...promptsValidation}
      />
    </BuilderSection>
  );
}
