import { isEqual, omit } from 'es-toolkit/compat';
import { useCallback, useMemo } from 'react';
import {
  change,
  reduxForm,
  type InjectedFormProps,
} from 'redux-form';

import type { Variable } from '@codaco/protocol-validation';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { updateVariableAsync } from '~/ducks/modules/protocol/codebook';
import {
  EMPTY_VARIABLES,
  getVariablesForSubjectSelector,
} from '~/selectors/codebook';

import ValidationSection from './ValidationSection';

type Entity = 'node' | 'edge' | 'ego';
type ValidationValue = boolean | number | string | null;
type ValidationMap = Record<string, ValidationValue>;

type ValidationFormValues = {
  validation?: ValidationMap | null;
  options?: unknown;
  component?: unknown;
  parameters?: unknown;
};

type ValidationFormProps = {
  form: string;
  entity: Entity;
  variableId: string;
  variable: Variable;
  variables: Record<string, Variable>;
  onValidationChange: (validation: ValidationMap) => void;
};

const VariableValidationForm = ({
  form,
  entity,
  variableId,
  variable,
  variables,
}: ValidationFormProps &
  InjectedFormProps<ValidationFormValues, ValidationFormProps>) => (
  <ValidationSection
    form={form}
    entity={entity}
    variableType={variable.type}
    existingVariables={omit(variables, variableId)}
    allVariables={variables}
    currentVariableId={variableId}
    id={`codebook-validation-${variableId}`}
    summary="Add one or more validation rules to the selected variable."
  />
);

const ConnectedVariableValidationForm = reduxForm<
  ValidationFormValues,
  ValidationFormProps
>({
  destroyOnUnmount: true,
  enableReinitialize: true,
  touchOnBlur: false,
  touchOnChange: true,
  onChange: (values, _dispatch, props, previousValues) => {
    const nextValidation = values.validation ?? {};
    const previousValidation = previousValues.validation ?? {};
    if (!isEqual(nextValidation, previousValidation)) {
      props.onValidationChange(nextValidation);
    }
  },
})(VariableValidationForm);

const isEntity = (value: string): value is Entity =>
  value === 'node' || value === 'edge' || value === 'ego';

const getValidation = (variable: Variable): ValidationMap => {
  if (!('validation' in variable) || !variable.validation) {
    return {};
  }

  return variable.validation as ValidationMap;
};

type CodebookVariableValidationSectionProps = {
  form: string;
  fieldName: string;
  entity: string;
  type?: string | null;
  variableId?: string | null;
};

/**
 * Reuses the form-field editor's ValidationSection for a variable picker that
 * lives directly on a stage. Its isolated Redux Form keeps the validation
 * draft out of the stage schema; committed rule changes are written back to
 * the selected codebook variable instead.
 */
const CodebookVariableValidationSection = ({
  form,
  fieldName,
  entity,
  type,
  variableId,
}: CodebookVariableValidationSectionProps) => {
  const dispatch = useAppDispatch();
  const subject = useMemo(
    () =>
      isEntity(entity)
        ? {
            entity,
            ...(type ? { type } : {}),
          }
        : null,
    [entity, type],
  );
  const variables = useAppSelector((state) =>
    subject
      ? getVariablesForSubjectSelector(state, subject)
      : EMPTY_VARIABLES,
  );
  const variable =
    typeof variableId === 'string' ? variables[variableId] : undefined;
  const currentValidation = useMemo(
    () => (variable ? getValidation(variable) : {}),
    [variable],
  );
  const handleValidationChange = useCallback(
    (validation: ValidationMap) => {
      if (!variableId || isEqual(validation, currentValidation)) {
        return;
      }

      dispatch(change(form, '_modified', Date.now()));
      void dispatch(
        updateVariableAsync({
          variable: variableId,
          configuration: { validation } as Partial<Variable>,
          replaceProperties: ['validation'],
        }),
      );
    },
    [currentValidation, dispatch, form, variableId],
  );
  const initialValues = useMemo<ValidationFormValues>(
    () =>
      variable
        ? {
            validation: currentValidation,
            ...('options' in variable ? { options: variable.options } : {}),
            ...('component' in variable
              ? { component: variable.component }
              : {}),
            ...('parameters' in variable
              ? { parameters: variable.parameters }
              : {}),
          }
        : {},
    [currentValidation, variable],
  );

  if (!subject || !variableId || !variable) {
    return null;
  }

  const validationFormName = `${form}-${fieldName}-${variableId}-validation`;

  return (
    <ConnectedVariableValidationForm
      key={validationFormName}
      form={validationFormName}
      entity={subject.entity}
      variableId={variableId}
      variable={variable}
      variables={variables}
      initialValues={initialValues}
      onValidationChange={handleValidationChange}
    />
  );
};

export default CodebookVariableValidationSection;
