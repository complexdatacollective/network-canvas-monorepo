import type { UnknownAction } from '@reduxjs/toolkit';
import { createSelector } from '@reduxjs/toolkit';
import { get, pickBy } from 'es-toolkit/compat';
import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import type { Variable } from '@codaco/protocol-validation';
import { Subsection } from '~/components/EditorLayout';
import Validations from '~/components/Validations';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/modules/root';
import { cx } from '~/utils/cva';

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

  const [isEnabled, setIsEnabled] = useState(!!hasValidation);

  // Keep the toggle in sync when the underlying validation is set/cleared
  // elsewhere (e.g. a form reset). Adding a rule sets hasValidation, removing
  // the last rule clears it; enabling the toggle before adding a rule keeps
  // hasValidation false, so this only fires on an actual change.
  useEffect(() => {
    setIsEnabled(!!hasValidation);
  }, [hasValidation]);

  const handleToggle = (nextState: boolean) => {
    setIsEnabled(nextState);
    if (!nextState) {
      dispatch(change(form, 'validation', null) as UnknownAction);
    }
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
    <Subsection
      id={getFieldId('validation')}
      title="Validation"
      summary={<p>Add one or more validation rules to this form field.</p>}
      disabled={disabled}
      action={
        <ToggleField
          title="Turn validation on or off"
          value={isEnabled}
          onChange={(checked) => handleToggle(!!checked)}
          disabled={disabled}
          className={cx(
            'shrink-0',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        />
      }
    >
      {isEnabled && (
        <Validations
          form={form}
          name="validation"
          variableType={variableType}
          entity={entity}
          existingVariables={existingVariablesForType}
        />
      )}
    </Subsection>
  );
};

export default ValidationSection;
