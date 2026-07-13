import { useRef, type ComponentProps, type ReactNode } from 'react';
import type { WrappedFieldProps } from 'redux-form';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import StyledSelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import { getReduxFieldErrorState } from '~/components/Form/reduxFieldMeta';

type SharedAdapterProps = WrappedFieldProps & {
  label: string;
  labelHidden?: boolean;
  hint?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
};

type SkipLogicRadioGroupReduxFieldProps = SharedAdapterProps & {
  options: ComponentProps<typeof RadioGroupField>['options'];
};

export const SkipLogicRadioGroupReduxField = ({
  input,
  meta,
  label,
  labelHidden,
  hint,
  required,
  disabled,
  readOnly,
  options,
}: SkipLogicRadioGroupReduxFieldProps) => {
  const { errors, showErrors } = getReduxFieldErrorState(meta);
  const value =
    typeof input.value === 'string' || typeof input.value === 'number'
      ? input.value
      : undefined;
  const valueRef = useRef(value);
  valueRef.current = value;

  return (
    <UnconnectedField
      component={RadioGroupField}
      name={input.name}
      label={label}
      labelHidden={labelHidden}
      hint={hint}
      value={value}
      onChange={(nextValue) => {
        valueRef.current = nextValue;
        input.onChange(nextValue);
      }}
      onBlur={() => input.onBlur(valueRef.current)}
      onFocus={(event) => input.onFocus(event)}
      options={options}
      required={required}
      disabled={disabled}
      readOnly={readOnly}
      errors={errors}
      showErrors={showErrors}
      aria-invalid={showErrors || undefined}
    />
  );
};

type SkipLogicSelectReduxFieldProps = SharedAdapterProps & {
  options: ComponentProps<typeof StyledSelectField>['options'];
};

export const SkipLogicSelectReduxField = ({
  input,
  meta,
  label,
  labelHidden,
  hint,
  required,
  disabled,
  readOnly,
  options,
}: SkipLogicSelectReduxFieldProps) => {
  const { errors, showErrors } = getReduxFieldErrorState(meta);
  const value =
    typeof input.value === 'string' || typeof input.value === 'number'
      ? input.value
      : undefined;
  const valueRef = useRef(value);
  valueRef.current = value;

  return (
    <UnconnectedField
      component={StyledSelectField}
      name={input.name}
      label={label}
      labelHidden={labelHidden}
      hint={hint}
      value={value}
      onChange={(nextValue) => {
        valueRef.current = nextValue;
        input.onChange(nextValue);
      }}
      onBlur={() => input.onBlur(valueRef.current)}
      onFocus={(event) => input.onFocus(event)}
      options={options}
      required={required}
      disabled={disabled}
      readOnly={readOnly}
      errors={errors}
      showErrors={showErrors}
      aria-invalid={showErrors || undefined}
    />
  );
};
