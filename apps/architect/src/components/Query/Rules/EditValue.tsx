import type { ComponentType } from 'react';
import { withProps } from 'react-recompose';

import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import DetachedField from '~/components/DetachedField';
import { FrescoReduxField, reduxNumberValue } from '~/components/Form';
import { Toggle } from '~/components/Form/Fields';

const FrescoInputField = InputField as ComponentType<Record<string, unknown>>;
const FrescoCheckboxGroupField = CheckboxGroupField as ComponentType<
  Record<string, unknown>
>;
const FrescoRadioGroupField = RadioGroupField as ComponentType<
  Record<string, unknown>
>;

const reduxArrayValue = {
  fromReduxValue: (value: unknown) => (Array.isArray(value) ? value : []),
  toReduxValue: (value: unknown) => (Array.isArray(value) ? value : []),
};

// Categorical attributes are stored as arrays of selected option values, so
// their rule operand is also an array (CheckboxGroup). Ordinal remains a single
// scalar value (RadioGroup).
const INPUT_TYPES = {
  string: {
    component: FrescoReduxField as ComponentType<Record<string, unknown>>,
    props: { fieldComponent: FrescoInputField },
  },
  number: {
    component: FrescoReduxField as ComponentType<Record<string, unknown>>,
    props: {
      fieldComponent: FrescoInputField,
      type: 'number',
      ...reduxNumberValue,
    },
  },
  boolean: {
    component: Toggle as ComponentType<Record<string, unknown>>,
    props: {},
  },
  categorical: {
    component: FrescoReduxField as ComponentType<Record<string, unknown>>,
    props: {
      fieldComponent: FrescoCheckboxGroupField,
      ...reduxArrayValue,
    },
  },
  ordinal: {
    component: FrescoReduxField as ComponentType<Record<string, unknown>>,
    props: { fieldComponent: FrescoRadioGroupField },
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
  fieldComponent?: ComponentType<Record<string, unknown>>;
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
  <DetachedField
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
