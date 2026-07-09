import type { ComponentType, ReactNode } from 'react';
import type { WrappedFieldProps } from 'redux-form';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';

type FrescoFieldComponent = ComponentType<Record<string, unknown>>;

type FrescoReduxFieldProps = WrappedFieldProps & {
  fieldComponent: FrescoFieldComponent;
  label?: string;
  hint?: ReactNode;
  inline?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  fromReduxValue?: (value: unknown) => unknown;
  toReduxValue?: (value: unknown) => unknown;
  [key: string]: unknown;
};

const getFieldErrors = (error: unknown): string[] => {
  if (!error) return [];
  return Array.isArray(error) ? error.map(String) : [String(error)];
};

const normalizeOption = (option: unknown): unknown => {
  if (typeof option === 'string' || typeof option === 'number') {
    return { value: option, label: String(option) };
  }

  if (!option || typeof option !== 'object' || !('value' in option)) {
    return option;
  }

  const optionRecord = option as Record<string, unknown>;

  return {
    ...optionRecord,
    label:
      typeof optionRecord.label === 'string'
        ? optionRecord.label
        : String(optionRecord.label ?? optionRecord.value),
  };
};

const normalizeFieldProps = (fieldProps: Record<string, unknown>) => {
  if (!Array.isArray(fieldProps.options)) {
    return fieldProps;
  }

  return {
    ...fieldProps,
    options: fieldProps.options.map(normalizeOption),
  };
};

const formatNumberValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
};

const parseIntegerValue = (value: unknown) => {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isNaN(parsed) ? null : parsed;
};

export const reduxNumberValue = {
  fromReduxValue: formatNumberValue,
  toReduxValue: parseIntegerValue,
};

const FrescoReduxField = ({
  input,
  meta,
  fieldComponent,
  label,
  hint,
  inline,
  disabled,
  readOnly,
  fromReduxValue,
  toReduxValue,
  ...fieldProps
}: FrescoReduxFieldProps) => {
  const rawError = meta.error ?? meta.submitError;
  const errors = getFieldErrors(rawError);
  const showErrors = Boolean((meta.touched || meta.submitFailed) && rawError);
  const value = fromReduxValue ? fromReduxValue(input.value) : input.value;
  const normalizedFieldProps = normalizeFieldProps(fieldProps);

  const handleChange = (nextValue: unknown) => {
    input.onChange(toReduxValue ? toReduxValue(nextValue) : nextValue);
  };

  const handleBlur = () => {
    input.onBlur?.(input.value);
  };

  return (
    <UnconnectedField
      {...normalizedFieldProps}
      component={fieldComponent}
      name={input.name ?? undefined}
      label={label ?? input.name ?? ''}
      hint={hint}
      inline={inline}
      disabled={disabled}
      readOnly={readOnly}
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={input.onFocus}
      errors={errors}
      showErrors={showErrors}
      aria-invalid={showErrors}
    />
  );
};

export default FrescoReduxField;
