'use client';

import { createElement } from 'react';

import { useField } from '../hooks/useField';
import type { FieldValue } from '../store/types';
import { filterValidationProps } from '../validation/helpers';
import { BaseField } from './BaseField';
import type { FieldProps, ValidFieldComponent } from './types';

/**
 * Field component that connects to form context via useField hook.
 * Provides automatic state management, validation, and error display.
 *
 * The component prop must implement FieldValueProps<V> where V extends FieldValue.
 * This ensures type-safe value handling throughout the form system.
 *
 * For fields outside of form context, use UnconnectedField instead.
 */
export default function Field<C extends ValidFieldComponent>({
  name,
  label,
  hint,
  inline,
  initialValue,
  showValidationHints = false,
  validationContext,
  validateOnChange,
  validateOnChangeDelay,
  component,
  disabled,
  readOnly,
  ...componentProps
}: FieldProps<C>) {
  const { id, containerProps, fieldProps, meta, validationSummary } = useField({
    name,
    initialValue: initialValue as FieldValue,
    showValidationHints,
    validationContext,
    validateOnChange,
    validateOnChangeDelay,
    disabled,
    readOnly,
    // Pass validation props
    ...componentProps,
  });

  // Use createElement instead of JSX so we can hand React the merged props
  // without TS demanding they match the narrow ValidFieldComponent shape.
  // ValidFieldComponent only encodes the minimum required by Field — the
  // concrete component declared by the consumer accepts these merged props
  // because FieldProps is built from React.ComponentProps<C>.
  const mergedProps = {
    id,
    name,
    ...fieldProps,
    ...filterValidationProps(componentProps),
  } as React.ComponentProps<C>;

  return (
    <BaseField
      id={id}
      name={name}
      label={label}
      hint={hint}
      inline={inline}
      validationSummary={validationSummary}
      required={Boolean(componentProps.required)}
      errors={meta.errors}
      showErrors={meta.shouldShowError}
      containerProps={containerProps}
    >
      {createElement(component, mergedProps)}
    </BaseField>
  );
}
