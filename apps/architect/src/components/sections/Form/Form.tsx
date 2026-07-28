import { type ComponentType, useCallback, useMemo } from 'react';
import { compose } from 'react-recompose';
import { useSelector } from 'react-redux';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import withDisabledFormTitle from '~/components/enhancers/withDisabledFormTitle';
import withDisabledSubjectRequired from '~/components/enhancers/withDisabledSubjectRequired';
import withSubject from '~/components/enhancers/withSubject';
import DialogArrayField from '~/components/Form/DialogArrayField';
import FrescoReduxField from '~/components/Form/FrescoReduxField';
import ValidatedField from '~/components/Form/ValidatedField';
import ValidatedFieldArray from '~/components/Form/ValidatedFieldArray';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import type { RootState } from '~/ducks/modules/root';
import {
  EMPTY_VARIABLES,
  getVariablesForSubjectSelector,
} from '~/selectors/codebook';
import { getVariableRoleMap, roleMapKey } from '~/selectors/indexes';

import { makeFieldEditorValidate } from '../../Validations/contradictions';
import FieldFields from './FieldFields';
import FieldPreview from './FieldPreview';
import { itemSelector, normalizeField } from './helpers';
import withFormHandlers from './withFormHandlers';

// Narrows the form's loosely-typed subject entity (sourced from redux-form
// state via withSubject) to the literal union getVariablesForSubjectSelector
// requires.
const isSubjectEntity = (
  value: string | null,
): value is 'node' | 'edge' | 'ego' =>
  value === 'node' || value === 'edge' || value === 'ego';

const FrescoInputField = InputField as ComponentType<Record<string, unknown>>;
const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';

type FormProps = StageEditorSectionProps & {
  handleChangeFields: (field: Record<string, unknown>) => unknown;
  disabled?: boolean;
  disabledMessage?: string;
  disableFormTitle?: boolean;
  type?: string | null;
  entity?: string | null;
};
const Form = ({
  handleChangeFields,
  disabled = false,
  disabledMessage,
  type = null,
  entity = null,
  disableFormTitle = false,
}: FormProps) => {
  // Memoized on the primitives so the subject object identity is stable
  // across renders, matching getVariablesForSubjectSelector's reselect
  // memoization instead of defeating it every render.
  const subject = useMemo(
    () =>
      isSubjectEntity(entity) ? { entity, type: type ?? undefined } : null,
    [entity, type],
  );
  const allVariables = useSelector((state: RootState) =>
    subject ? getVariablesForSubjectSelector(state, subject) : EMPTY_VARIABLES,
  );
  const roleMap = useSelector(getVariableRoleMap);
  // Backs makeFieldEditorValidate's save-time gate: a form field may not pick
  // a variable some bin/highlight/census/etc. elsewhere already writes.
  const hasUnvalidatedUse = useCallback(
    (variableId: string) =>
      !!subject &&
      (roleMap[roleMapKey(subject, variableId)]?.unvalidated ?? 0) > 0,
    [roleMap, subject],
  );
  const editorValidate = useMemo(
    () => makeFieldEditorValidate(allVariables, undefined, hasUnvalidatedUse),
    [allVariables, hasUnvalidatedUse],
  );

  return (
    <Section
      disabled={disabled}
      disabledMessage={disabledMessage}
      group
      title="Form"
      summary={
        <Paragraph>
          Add one or more fields to your form to collect attributes about each
          node the participant creates. Use the drag handle on the left of each
          prompt adjust its order.
        </Paragraph>
      }
    >
      {!disableFormTitle && (
        <ValidatedField
          name="form.title"
          component={FrescoReduxField}
          validation={{ required: true }}
          label="Form heading text (e.g 'Add a person')"
          componentProps={{
            fieldComponent: FrescoInputField,
            placeholder: 'Enter your title here',
          }}
        />
      )}
      <ValidatedFieldArray
        name="form.fields"
        label={disableFormTitle ? undefined : 'Form Fields'}
        component={DialogArrayField}
        validation={{ notEmpty }}
        componentProps={{
          addTitle: 'Edit Field',
          editorFieldsComponent: FieldFields,
          editorProps: { type, entity },
          editorTitle: 'Edit Field',
          editorValidate,
          itemLabel: 'field',
          itemSelector: itemSelector(entity, type),
          normalizeItem: (value: unknown) =>
            normalizeField(value as Record<string, unknown>),
          onBeforeSave: (value: unknown) =>
            handleChangeFields(value as Record<string, unknown>),
          previewComponent: FieldPreview,
          requestedEditFormName: 'editable-list-form',
          sortable: true,
        }}
      />
    </Section>
  );
};
export default compose<FormProps, StageEditorSectionProps>(
  withSubject,
  withFormHandlers,
  withDisabledFormTitle,
  withDisabledSubjectRequired,
)(Form);
