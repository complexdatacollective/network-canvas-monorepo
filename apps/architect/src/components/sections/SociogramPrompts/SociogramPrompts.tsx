import { useCallback, useMemo, type ComponentType } from 'react';
import { useSelector } from 'react-redux';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import DialogArrayField from '~/components/Form/arrayFields/DialogArrayField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageInitialValue,
  useSubject,
} from '~/components/StageEditor/stageFormHooks';
import {
  crossClassPickIssue,
  validatedElsewhereMessage,
} from '~/components/Validations/contradictions';
import type { RootState } from '~/ducks/modules/root';
import {
  EMPTY_VARIABLES,
  getVariablesForSubjectSelector,
} from '~/selectors/codebook';
import { getVariableRoleMap, roleMapKey } from '~/selectors/indexes';

import withDisabledSubjectRequired from '../../enhancers/withDisabledSubjectRequired';
import PromptFields from './PromptFields';
import PromptPreview from './PromptPreview';

type Prompt = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSubjectEntity = (
  value: string | undefined,
): value is 'node' | 'edge' | 'ego' =>
  value === 'node' || value === 'edge' || value === 'ego';

const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';

// Deliberately NOT `StageEditorSectionProps & {...}`: `withDisabledSubjectRequired`
// only ever supplies `{interfaceType?, type?}` (own) and `{disabled,
// disabledMessage}` (injected) — the component it wraps must accept exactly
// that shape (or less) for the composition below to typecheck. `stagePath`/
// `stagePosition` pass through unread (the section doesn't need them).
type SociogramPromptsProps = {
  disabled?: boolean;
  disabledMessage?: string;
};

const SociogramPrompts = ({
  disabled,
  disabledMessage,
}: SociogramPromptsProps) => {
  const { entity, type } = useSubject();
  const initialPrompts = useStageInitialValue<Prompt[]>('prompts');
  const subject = useMemo(
    () => (isSubjectEntity(entity) && type ? { entity, type } : null),
    [entity, type],
  );
  const allVariables = useSelector((state: RootState) =>
    subject ? getVariablesForSubjectSelector(state, subject) : EMPTY_VARIABLES,
  );
  const roleMap = useSelector(getVariableRoleMap);
  // Cross-class exclusivity gate: the highlight toggle is an UNVALIDATED
  // writer, so its variable may not be one a form elsewhere already
  // collects (the save-time backstop for a stale draft that bypassed the
  // picker exclusion — see selectors.tsx's getHighlightVariablesForSubject).
  // Implemented as `editorValidate` rather than `onBeforeSave`: only the
  // dialog's own `initialValues` context (the row's pre-edit value) can
  // supply the "picked before this edit" escape hatch — `onBeforeSave`
  // receives the already-merged post-edit value with no way to tell an
  // unchanged pick from a changed one.
  const editorValidate = useCallback(
    (
      values: Record<string, unknown>,
      context?: { initialValues?: unknown },
    ) => {
      if (!subject) return undefined;
      const highlight = isRecord(values.highlight)
        ? values.highlight
        : undefined;
      const highlightVariable =
        typeof highlight?.variable === 'string' ? highlight.variable : '';
      const originalHighlight =
        isRecord(context?.initialValues) &&
        isRecord(context.initialValues.highlight)
          ? context.initialValues.highlight
          : undefined;
      const originalHighlightVariable =
        typeof originalHighlight?.variable === 'string'
          ? originalHighlight.variable
          : '';
      const issue = crossClassPickIssue({
        variableId: highlightVariable,
        originalVariableId: originalHighlightVariable,
        hasConflictingUse: (variableId) =>
          (roleMap[roleMapKey(subject, variableId)]?.validated ?? 0) > 0,
        allVariables,
        message: validatedElsewhereMessage,
      });
      if (!issue) return undefined;
      // Nested under `highlight.variable`, matching the field's own name
      // (PromptFieldsTapBehaviour.tsx's `ArchitectField name="highlight.variable"`).
      return { 'highlight.variable': issue };
    },
    [subject, roleMap, allVariables],
  );

  return (
    <Section
      disabled={disabled}
      disabledMessage={disabledMessage}
      summary={
        <Paragraph>
          Add one or more prompts below to frame the task for the user. You can
          reorder the prompts using the draggable handles on the left hand side.
        </Paragraph>
      }
      title="Prompts"
    >
      <ArchitectArrayField
        name="prompts"
        label="Prompts"
        labelHidden
        component={DialogArrayField}
        addButtonLabel="Create new prompt"
        validation={{ notEmpty }}
        initialValue={initialPrompts}
        addTitle="Edit Prompt"
        previewComponent={
          PromptPreview as ComponentType<Record<string, unknown>>
        }
        editorFieldsComponent={
          PromptFields as ComponentType<Record<string, unknown>>
        }
        editorTitle="Edit Prompt"
        itemLabel="prompt"
        editorDialogSize="editor"
        editorProps={{ entity, type }}
        editorValidate={editorValidate}
        requestedEditFormName="editable-list-form"
        sortable
      />
    </Section>
  );
};

const SociogramPromptsWithDisabledState =
  withDisabledSubjectRequired(SociogramPrompts);

/**
 * `withDisabledSubjectRequired` computes `disabled`/`disabledMessage` from
 * `interfaceType`/`type` props (the `withSubject` enhancer used to inject
 * `type`). Sections no longer receive `type` as a prop — it comes from
 * `useSubject()` — so this forwards it explicitly rather than composing the
 * two enhancers as before.
 */
const SociogramPromptsSection = (props: StageEditorSectionProps) => {
  const { type } = useSubject();
  return (
    <SociogramPromptsWithDisabledState {...props} type={type ?? undefined} />
  );
};

export default SociogramPromptsSection;
