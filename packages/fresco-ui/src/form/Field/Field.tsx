'use client';

import { createElement } from 'react';

import { useField } from '../hooks/useField';
import type { FieldValue } from '../store/types';
import { filterValidationProps } from '../validation/helpers';
import { BaseField } from './BaseField';
import { FieldControllerProvider } from './FieldController';
import { BASE_FIELD_ELEMENTS } from './fieldElements';
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
  nameMode,
  label,
  labelHidden,
  hint,
  inline,
  initialValue,
  showValidationHints = false,
  validationContext,
  validateOnChange,
  validateOnChangeDelay,
  validateOnControlBlur,
  component,
  disabled,
  readOnly,
  ...componentProps
}: FieldProps<C>) {
  const {
    id,
    containerProps,
    fieldProps,
    meta,
    controller,
    validationSummary,
  } = useField({
    name,
    nameMode,
    initialValue: initialValue as FieldValue,
    showValidationHints,
    validationContext,
    // Presence only: it decides whether `aria-describedby` may name the hint
    // element, which BaseField renders from `hint ?? validationSummary`.
    hint,
    // This is the component that renders the control inside a BaseField, so
    // it is the one that may point `fieldProps` at BaseField's elements.
    renderedElements: BASE_FIELD_ELEMENTS,
    validateOnChange,
    validateOnChangeDelay,
    validateOnControlBlur,
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
      labelHidden={labelHidden}
      hint={hint}
      inline={inline}
      validationSummary={validationSummary}
      required={Boolean(componentProps.required)}
      errors={meta.errors}
      showErrors={meta.shouldShowError}
      containerProps={containerProps}
    >
      <FieldControllerProvider controller={controller}>
        {createElement(component, mergedProps)}
      </FieldControllerProvider>
    </BaseField>
  );
}
