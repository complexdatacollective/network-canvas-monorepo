/* eslint-disable react/jsx-props-no-spreading */
import { useCallback, useMemo } from 'react';
import { compose } from 'react-recompose';
import { useSelector } from 'react-redux';
import { getFormInitialValues, SubmissionError } from 'redux-form';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import DialogArrayField from '~/components/Form/DialogArrayField';
import ValidatedFieldArray from '~/components/Form/ValidatedFieldArray';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
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
import withSubject from '../../enhancers/withSubject';
import PromptFields from './PromptFields';
import PromptPreview from './PromptPreview';

// The shared row-editor form name every DialogArrayField editor requests
// (see this file's own `requestedEditFormName`) — only one editor dialog is
// ever open at a time, so this is safe to read unqualified.
const EDIT_FORM_NAME = 'editable-list-form';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Narrows the section's loosely-typed subject entity (sourced from
// redux-form state via withSubject) to the literal union
// getVariablesForSubjectSelector requires.
const isSubjectEntity = (
  value: string | undefined,
): value is 'node' | 'edge' | 'ego' =>
  value === 'node' || value === 'edge' || value === 'ego';

const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';
type SociogramPromptsProps = StageEditorSectionProps & {
  entity?: string;
  type?: string;
  disabled?: boolean;
  disabledMessage?: string;
};
const SociogramPrompts = ({
  entity,
  type,
  disabled,
  disabledMessage,
}: SociogramPromptsProps) => {
  const subject = useMemo(
    () => (isSubjectEntity(entity) && type ? { entity, type } : null),
    [entity, type],
  );
  const allVariables = useSelector((state: RootState) =>
    subject ? getVariablesForSubjectSelector(state, subject) : EMPTY_VARIABLES,
  );
  const roleMap = useSelector(getVariableRoleMap);
  const originalHighlightVariable = useSelector((state: RootState) => {
    const initial = getFormInitialValues(EDIT_FORM_NAME)(state);
    const highlight = isRecord(initial) ? initial.highlight : undefined;
    return isRecord(highlight) && typeof highlight.variable === 'string'
      ? highlight.variable
      : '';
  });
  // Cross-class exclusivity gate: the highlight toggle is an UNVALIDATED
  // writer, so its variable may not be one a form elsewhere already
  // collects (the save-time backstop for a stale draft that bypassed the
  // picker exclusion — see selectors.tsx's getHighlightVariablesForSubject).
  // `highlight.variable` is a plain nested field
  // (PromptFieldsTapBehaviour.tsx's ValidatedField name="highlight.variable"),
  // so the thrown error is nested the same way.
  const onBeforeSave = useCallback(
    (value: unknown) => {
      if (!subject || !isRecord(value)) return value;
      const highlight = value.highlight;
      const highlightVariable =
        isRecord(highlight) && typeof highlight.variable === 'string'
          ? highlight.variable
          : '';
      const issue = crossClassPickIssue({
        variableId: highlightVariable,
        originalVariableId: originalHighlightVariable,
        hasConflictingUse: (variableId) =>
          (roleMap[roleMapKey(subject, variableId)]?.validated ?? 0) > 0,
        allVariables,
        message: validatedElsewhereMessage,
      });
      if (issue) {
        // `highlight.variable` is a nested plain field, not a FieldArray —
        // redux-form's FormErrors type only maps a FormData key to
        // `ReactElement | ErrorType`, so the nested `{ variable }` shape
        // needs an explicit ErrorType (mirroring the `{ _error: string }`
        // FieldArray precedent in withPromptChangeHandler.tsx) rather than
        // the default `string`.
        throw new SubmissionError<{ highlight: unknown }, { variable: string }>(
          { highlight: { variable: issue } },
        );
      }
      return value;
    },
    [subject, roleMap, allVariables, originalHighlightVariable],
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
      <ValidatedFieldArray
        name="prompts"
        label="Prompts"
        component={DialogArrayField}
        validation={{ notEmpty }}
        componentProps={{
          addTitle: 'Edit Prompt',
          previewComponent: PromptPreview,
          editorFieldsComponent: PromptFields,
          editorTitle: 'Edit Prompt',
          itemLabel: 'prompt',
          editorProps: { entity, type },
          onBeforeSave,
          requestedEditFormName: 'editable-list-form',
          sortable: true,
        }}
      />
    </Section>
  );
};
export default compose<SociogramPromptsProps, StageEditorSectionProps>(
  withSubject,
  withDisabledSubjectRequired,
)(SociogramPrompts);
