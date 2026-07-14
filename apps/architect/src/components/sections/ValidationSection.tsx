import type { UnknownAction } from '@reduxjs/toolkit';
import { createSelector } from '@reduxjs/toolkit';
import { get, pickBy } from 'es-toolkit/compat';
import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { Variable } from '@codaco/protocol-validation';
import { Section } from '~/components/EditorLayout';
import Validations from '~/components/Validations';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/modules/root';

import { getFieldId } from '../../utils/issues';
type ValidationSectionProps = {
  disabled?: boolean;
  form: string;
  entity: string;
  variableType?: string;
  existingVariables: Record<string, Pick<Variable, 'name' | 'type'>>;
};
const ValidationSection = ({
  disabled = false,
  form,
  entity,
  variableType = '',
  existingVariables,
}: ValidationSectionProps) => {
  const dispatch = useAppDispatch();
  // Create memoized selector for hasValidation
  const hasValidationSelector = useMemo(() => {
    const formSelector = formValueSelector(form);
    return createSelector(
      [(state: RootState) => formSelector(state, 'validation')],
      (validation) => validation && Object.keys(validation).length > 0,
    );
  }, [form]);
  const hasValidation = useSelector(hasValidationSelector);
  const handleToggleChange = (nextState: boolean) => {
    if (!nextState) {
      dispatch(change(form, 'validation', null) as UnknownAction);
    }
    return true;
  };
  const existingVariablesForType = useMemo(
    () =>
      pickBy(
        existingVariables,
        (variable) => get(variable, 'type') === variableType,
      ),
    [existingVariables, variableType],
  );
  return (
    <Section
      layout="vertical"
      id={getFieldId('validation')}
      title="Validation"
      summary={
        <Paragraph>
          Add one or more validation rules to this form field.
        </Paragraph>
      }
      disabled={disabled}
      toggleable
      startExpanded={!!hasValidation}
      handleToggleChange={handleToggleChange}
    >
      <Validations
        form={form}
        name="validation"
        variableType={variableType}
        entity={entity}
        existingVariables={existingVariablesForType}
      />
    </Section>
  );
};
export default ValidationSection;
