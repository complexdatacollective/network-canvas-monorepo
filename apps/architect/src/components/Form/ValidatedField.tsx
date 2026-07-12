import { startCase } from 'es-toolkit/compat';
import type { ComponentType, ElementType, InputHTMLAttributes } from 'react';
import { type BaseFieldProps, Field, type WrappedFieldProps } from 'redux-form';

import useValidate from '~/hooks/useValidate';

import IssueAnchor from '../IssueAnchor';

// Generic T should contain ONLY the component's unique props (not WrappedFieldProps). F should be the type of the field's value.
type ValidatedFieldProps<T = Record<string, never>> = Omit<
  BaseFieldProps,
  'validate' | 'component' | 'props'
> & {
  validation: Record<string, unknown>;
  component: ElementType;
  componentProps?: T;
  label?: string;
  fieldLabel?: string;
  inline?: boolean;
  entityType?: string;
  promptBeforeChange?: string;
} & InputHTMLAttributes<HTMLInputElement>;

/**
 * A wrapper around redux-form's Field component that converts our validation
 * objects into a format that redux-form can understand.
 */
function ValidatedField<T = Record<string, never>>({
  validation,
  component,
  componentProps,
  ...fieldProps
}: ValidatedFieldProps<T>) {
  const validations = useValidate(validation);
  const requiredValidation = validation.required;
  const validationRequiresValue =
    typeof requiredValidation === 'object' && requiredValidation !== null
      ? 'value' in requiredValidation && Boolean(requiredValidation.value)
      : typeof requiredValidation === 'string' || Boolean(requiredValidation);
  const required = fieldProps.required ?? validationRequiresValue;
  // redux-form injects WrappedFieldProps at runtime. ElementType keeps this
  // boundary compatible with connected legacy fields whose inferred props are
  // wider than their rendered component's props.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const reduxFieldComponent = component as ComponentType<WrappedFieldProps & T>;

  return (
    <>
      <IssueAnchor
        fieldName={`${fieldProps.name}._error`}
        description={startCase(fieldProps.name)}
      />
      <Field
        {...fieldProps}
        {...componentProps}
        required={required}
        validate={validations}
        component={reduxFieldComponent}
      />
    </>
  );
}

export default ValidatedField;
