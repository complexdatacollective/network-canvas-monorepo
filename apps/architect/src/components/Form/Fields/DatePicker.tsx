import type { ComponentType, ReactNode } from 'react';
import type { WrappedFieldProps } from 'redux-form';

import DatePickerField from '@codaco/fresco-ui/form/fields/DatePicker';

import FrescoReduxField from '../FrescoReduxField';

export const DATE_TYPES = [
  {
    label: 'Full',
    value: 'full',
  },
  {
    label: 'Month',
    value: 'month',
  },
  {
    label: 'Year',
    value: 'year',
  },
] as const;

export const DATE_FORMATS = {
  full: 'yyyy-MM-dd',
  month: 'yyyy-MM',
  year: 'yyyy',
} as const;

type DatePickerType = (typeof DATE_TYPES)[number]['value'];

type DatePickerParameters = {
  type?: unknown;
  min?: unknown;
  max?: unknown;
};

type DatePickerReduxFieldProps = WrappedFieldProps & {
  parameters?: DatePickerParameters;
  label?: string | null;
  fieldLabel?: string | null;
  hint?: ReactNode;
  placeholder?: string | null;
  className?: string | null;
  hidden?: boolean | null;
  disabled?: boolean;
  readOnly?: boolean;
  inline?: boolean;
};

const FrescoDatePickerField = DatePickerField as ComponentType<
  Record<string, unknown>
>;
const FrescoReduxFieldComponent = FrescoReduxField as ComponentType<
  DatePickerReduxFieldProps & Record<string, unknown>
>;

const datePickerTypes = new Set<DatePickerType>(
  DATE_TYPES.map(({ value }) => value),
);

const getDatePickerType = (value: unknown): DatePickerType =>
  typeof value === 'string' && datePickerTypes.has(value as DatePickerType)
    ? (value as DatePickerType)
    : 'full';

const getOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const fromReduxDateValue = (value: unknown) =>
  typeof value === 'string' ? value : '';

const toReduxDateValue = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : null;

const DatePicker = ({
  input,
  parameters = {},
  label = null,
  fieldLabel = null,
  placeholder = null,
  className = null,
  hidden = null,
  ...props
}: DatePickerReduxFieldProps) => {
  if (hidden) {
    return null;
  }

  return (
    <FrescoReduxFieldComponent
      {...props}
      input={input}
      fieldComponent={FrescoDatePickerField}
      label={fieldLabel ?? label ?? input.name ?? 'Date'}
      placeholder={placeholder ?? undefined}
      type={getDatePickerType(parameters.type)}
      min={getOptionalString(parameters.min)}
      max={getOptionalString(parameters.max)}
      className={className ?? undefined}
      fromReduxValue={fromReduxDateValue}
      toReduxValue={toReduxDateValue}
    />
  );
};

export default DatePicker;
