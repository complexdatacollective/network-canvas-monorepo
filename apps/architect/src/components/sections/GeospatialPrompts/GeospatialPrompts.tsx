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
type GeospatialPromptsProps = StageEditorSectionProps & {
  entity?: string;
  type?: string;
  disabled?: boolean;
  disabledMessage?: string;
};
const GeospatialPrompts = ({
  entity,
  type,
  disabled,
  disabledMessage,
}: GeospatialPromptsProps) => {
  const subject = useMemo(
    () => (isSubjectEntity(entity) && type ? { entity, type } : null),
    [entity, type],
  );
  const allVariables = useSelector((state: RootState) =>
    subject ? getVariablesForSubjectSelector(state, subject) : EMPTY_VARIABLES,
  );
  const roleMap = useSelector(getVariableRoleMap);
  const originalVariable = useSelector((state: RootState) => {
    const initial = getFormInitialValues(EDIT_FORM_NAME)(state);
    return isRecord(initial) && typeof initial.variable === 'string'
      ? initial.variable
      : '';
  });
  // Cross-class exclusivity gate: the geospatial selection is an UNVALIDATED
  // writer, so its variable may not be one a form elsewhere already collects
  // (the save-time backstop for a stale draft that bypassed the picker
  // exclusion — see the shared withVariableOptions' excludeValidatedUses
  // call). `variable` is a plain field on the prompt form (PromptFields.tsx's
  // ValidatedField name="variable"), so a STRING value renders correctly.
  const onBeforeSave = useCallback(
    (value: unknown) => {
      if (!subject || !isRecord(value)) return value;
      const variable = typeof value.variable === 'string' ? value.variable : '';
      const issue = crossClassPickIssue({
        variableId: variable,
        originalVariableId: originalVariable,
        hasConflictingUse: (variableId) =>
          (roleMap[roleMapKey(subject, variableId)]?.validated ?? 0) > 0,
        allVariables,
        message: validatedElsewhereMessage,
      });
      if (issue) {
        throw new SubmissionError({ variable: issue });
      }
      return value;
    },
    [subject, roleMap, allVariables, originalVariable],
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
        labelHidden
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
export default compose<GeospatialPromptsProps, StageEditorSectionProps>(
  withSubject,
  withDisabledSubjectRequired,
)(GeospatialPrompts);
