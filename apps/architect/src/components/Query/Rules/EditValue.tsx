import { withProps } from 'react-recompose';

import type { ValidFieldComponent } from '@codaco/fresco-ui/form/Field/types';
import BooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import { type FieldValue } from '@codaco/fresco-ui/form/store/types';

import RuleField from './RuleField';

// `InputField` is string-valued (it emits `e.target.value` verbatim, even for
// `type="number"`), while a rule's value must round-trip as a real number.
const formatNumberValue = (value: unknown) =>
  value === null || value === undefined ? '' : String(value);

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

const parseIntegerValue = (value: unknown) => {
  const parsed = parseNumberValue(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
};

const numberValue = {
  fromValue: formatNumberValue,
  toValue: parseNumberValue,
};

const integerValue = {
  fromValue: formatNumberValue,
  toValue: parseIntegerValue,
};

const arrayValue = {
  fromValue: (value: unknown) => (Array.isArray(value) ? value : []),
  toValue: (value: unknown) => (Array.isArray(value) ? value : []),
};

const booleanValue = {
  fromValue: (value: unknown) => Boolean(value),
  toValue: (value: unknown) => Boolean(value),
};

// Categorical attributes are stored as arrays of selected option values, so
// their rule operand is also an array (CheckboxGroup). Ordinal remains a single
// scalar value (RadioGroup).
const INPUT_TYPES = {
  string: {
    component: InputField,
    props: {},
  },
  number: {
    component: InputField,
    props: {
      type: 'number',
      step: 'any',
      ...numberValue,
    },
  },
  count: {
    component: InputField,
    props: {
      type: 'number',
      step: 1,
      min: 0,
      ...integerValue,
    },
  },
  boolean: {
    component: BooleanField,
    props: {
      ...booleanValue,
    },
  },
  categorical: {
    component: CheckboxGroupField,
    props: {
      ...arrayValue,
    },
  },
  ordinal: {
    component: RadioGroupField,
    props: {},
  },
};

type OptionItem = {
  value: string | number;
  label: string;
};

type EditValueProps = {
  label: string;
  hint?: string;
  value: FieldValue;
  options?: OptionItem[];
  onChange?: (
    event: unknown,
    value: unknown,
    oldValue: unknown,
    name: string | null,
  ) => void;
  variableType?: string;
  placeholder?: string;
  validation?: Record<string, unknown>;
};

const EditValue = ({
  fieldConfig,
  value,
  variableType = 'string',
  onChange = () => {},
  options = [],
  ...rest
}: EditValueProps & {
  fieldConfig: FieldConfig;
}) => (
  <RuleField
    component={fieldConfig.component}
    name="value"
    onChange={onChange}
    value={value}
    options={options.length > 0 ? options : undefined}
    {...fieldConfig.props}
    {...rest}
  />
);

type InputProps = {
  variableType?: string;
};

type MappedProps = {
  fieldConfig: FieldConfig;
};

type FieldConfig = {
  component: ValidFieldComponent;
  props: Record<string, unknown>;
};

const withMappedFieldComponent = withProps<MappedProps, InputProps>(
  ({ variableType }: InputProps): MappedProps => {
    const fieldConfig: FieldConfig =
      variableType && INPUT_TYPES[variableType as keyof typeof INPUT_TYPES]
        ? INPUT_TYPES[variableType as keyof typeof INPUT_TYPES]
        : INPUT_TYPES.string;

    return {
      fieldConfig,
    };
  },
);

export default withMappedFieldComponent(EditValue);
