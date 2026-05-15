import type { UnknownAction } from '@reduxjs/toolkit';
import { createSelector } from '@reduxjs/toolkit';
import { get, pickBy } from 'es-toolkit/compat';
import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

import type { Variable } from '@codaco/protocol-validation';
import { Row, Section } from '~/components/EditorLayout';
import Switch from '~/components/NewComponents/Switch';
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

  const showValidationHints = useSelector(
    (state: RootState) =>
      formValueSelector(form)(state, 'showValidationHints') as
        | boolean
        | undefined,
  );

  const handleToggleValidation = (nextState: boolean) => {
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
      disabled={disabled}
      id={getFieldId('validation')}
      toggleable
      title="Validation"
      summary={<p>Add one or more validation rules to this form field.</p>}
      startExpanded={!!hasValidation}
      handleToggleChange={handleToggleValidation}
      layout="vertical"
    >
      <Row>
        <Validations
          form={form}
          name="validation"
          variableType={variableType}
          entity={entity}
          existingVariables={existingVariablesForType}
        />
      </Row>
      <div className="mt-(--space-sm) flex items-center justify-between gap-(--space-md)">
        <div>
          <h4 className="text-base font-semibold">Show validation hints?</h4>
          <p className="text-sm text-current/70">
            Automatically display hints derived from this field&apos;s
            validation rules, helping participants understand input
            requirements.
          </p>
        </div>
        <Switch
          checked={!!showValidationHints}
          onCheckedChange={(checked) =>
            dispatch(
              change(form, 'showValidationHints', checked) as UnknownAction,
            )
          }
          className="shrink-0"
        />
      </div>
    </Section>
  );
};

export default ValidationSection;
