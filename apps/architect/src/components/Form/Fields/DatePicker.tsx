import { defineMessages } from '@codaco/app-i18n/messages';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import DatePickerField from '@codaco/fresco-ui/form/fields/DatePicker';
const configMessages = defineMessages({
  full: {
    id: 'architect.form.fields.datePicker.config.full',
    defaultMessage: 'Full',
    description:
      'Presentation label or description in components/Form/Fields/DatePicker.tsx. Identifiers are not translated.',
  },
  month: {
    id: 'architect.form.fields.datePicker.config.month',
    defaultMessage: 'Month',
    description:
      'Presentation label or description in components/Form/Fields/DatePicker.tsx. Identifiers are not translated.',
  },
  year: {
    id: 'architect.form.fields.datePicker.config.year',
    defaultMessage: 'Year',
    description:
      'Presentation label or description in components/Form/Fields/DatePicker.tsx. Identifiers are not translated.',
  },
});

export const DATE_TYPES = [
  {
    label: configMessages.full,
    value: 'full',
  },
  {
    label: configMessages.month,
    value: 'month',
  },
  {
    label: configMessages.year,
    value: 'year',
  },
] as const;

export const DATE_FORMATS = {
  full: 'yyyy-MM-dd',
  month: 'yyyy-MM',
  year: 'yyyy',
} as const;

type DatePickerType = (typeof DATE_TYPES)[number]['value'];

/**
 * The variable's `parameters` block as authored in the editor — untyped here
 * because it is being edited and may hold anything mid-edit.
 */
type DatePickerParameters = {
  type?: unknown;
  min?: unknown;
  max?: unknown;
};

type DatePickerProps = CreateFormFieldProps<
  string,
  'input',
  {
    parameters?: DatePickerParameters;
    placeholder?: string;
    // Narrows the `size` an <input> would otherwise contribute (a number) to
    // the control-size scale `DatePickerField` expects.
    size?: 'sm' | 'md' | 'lg';
  }
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

/**
 * Date input driven by a variable's `parameters` block. Labelling belongs to
 * the surrounding field — pass it through `ArchitectField`'s `label`/`hint`.
 */
const DatePicker = ({
  parameters = {},
  value,
  onChange,
  placeholder,
  ...props
}: DatePickerProps) => (
  <DatePickerField
    {...props}
    value={typeof value === 'string' ? value : ''}
    // An emptied picker must clear the stored value rather than persist ''.
    onChange={(nextValue) => onChange?.(nextValue ? nextValue : undefined)}
    placeholder={placeholder}
    type={getDatePickerType(parameters.type)}
    min={getOptionalString(parameters.min)}
    max={getOptionalString(parameters.max)}
  />
);

export default DatePicker;
