import type { ComponentType, ReactNode } from 'react';
import type { WrappedFieldProps } from 'redux-form';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';

import { getReduxFieldErrorState } from './reduxFieldMeta';

type FrescoFieldComponent = ComponentType<Record<string, unknown>>;

type FrescoReduxFieldProps = WrappedFieldProps & {
  fieldComponent: FrescoFieldComponent;
  label?: string;
  labelHidden?: boolean;
  hint?: ReactNode;
  inline?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  fromReduxValue?: (value: unknown) => unknown;
  toReduxValue?: (value: unknown) => unknown;
  [key: string]: unknown;
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
    return Number.isInteger(value) ? value : null;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : null;
};

const parseNumberValue = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const reduxNumberValue = {
  fromReduxValue: formatNumberValue,
  toReduxValue: parseNumberValue,
};

export const reduxIntegerValue = {
  fromReduxValue: formatNumberValue,
  toReduxValue: parseIntegerValue,
};

const FrescoReduxFieldBase = ({
  input,
  meta,
  fieldComponent,
  label,
  labelHidden,
  hint,
  inline,
  disabled,
  readOnly,
  fromReduxValue,
  toReduxValue,
  ...fieldProps
}: FrescoReduxFieldProps) => {
  const { errors, showErrors } = getReduxFieldErrorState(meta);
  const value = fromReduxValue ? fromReduxValue(input.value) : input.value;
  const normalizedFieldProps = normalizeFieldProps(fieldProps);

  const handleChange = (nextValue: unknown) => {
    input.onChange(toReduxValue ? toReduxValue(nextValue) : nextValue);
  };

  // Blur with an undefined payload so Redux Form only marks the field
  // touched/inactive. Passing input.value would write its formatted form (a
  // cleared value formats to '') back over the parsed Redux value.
  const handleBlur = () => {
    input.onBlur?.(undefined);
  };

  return (
    <UnconnectedField
      {...normalizedFieldProps}
      component={fieldComponent}
      name={input.name ?? undefined}
      label={label ?? input.name ?? ''}
      labelHidden={labelHidden}
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

const FrescoReduxField =
  FrescoReduxFieldBase as ComponentType<WrappedFieldProps> &
    ComponentType<Record<string, unknown>>;

export default FrescoReduxField;
