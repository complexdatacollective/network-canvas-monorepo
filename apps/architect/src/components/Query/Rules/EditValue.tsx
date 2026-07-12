import type { ComponentType } from 'react';
import { withProps } from 'react-recompose';

import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import {
  reduxIntegerValue,
  reduxNumberValue,
} from '~/components/Form/FrescoReduxField';

import RuleField from './RuleField';

const FrescoInputField = InputField as ComponentType<Record<string, unknown>>;
const FrescoCheckboxGroupField = CheckboxGroupField as ComponentType<
  Record<string, unknown>
>;
const FrescoRadioGroupField = RadioGroupField as ComponentType<
  Record<string, unknown>
>;
const FrescoToggleField = ToggleField as ComponentType<Record<string, unknown>>;

const numberValue = {
  fromValue: reduxNumberValue.fromReduxValue,
  toValue: reduxNumberValue.toReduxValue,
};

const integerValue = {
  fromValue: reduxIntegerValue.fromReduxValue,
  toValue: reduxIntegerValue.toReduxValue,
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
    component: FrescoInputField,
    props: {},
  },
  number: {
    component: FrescoInputField,
    props: {
      type: 'number',
      step: 'any',
      ...numberValue,
    },
  },
  count: {
    component: FrescoInputField,
    props: {
      type: 'number',
      step: 1,
      min: 0,
      ...integerValue,
    },
  },
  boolean: {
    component: FrescoToggleField,
    props: {
      inline: true,
      ...booleanValue,
    },
  },
  categorical: {
    component: FrescoCheckboxGroupField,
    props: {
      ...arrayValue,
    },
  },
  ordinal: {
    component: FrescoRadioGroupField,
    props: {},
  },
};

const getLabel = (
  type: string,
  value: string | number | boolean | (string | number)[],
): string | null => {
  if (type !== 'boolean') {
    return null;
  }
  return value ? 'True' : 'False';
};

type OptionItem = {
  value: string | number;
  label: string;
};

type EditValueProps = {
  value: string | number | boolean | (string | number)[];
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
    label={getLabel(variableType, value) ?? 'Attribute value'}
    name="value"
    onChange={onChange}
    value={value}
    options={options}
    {...fieldConfig.props}
    // eslint-disable-next-line react/jsx-props-no-spreading
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
  component: ComponentType<Record<string, unknown>>;
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
