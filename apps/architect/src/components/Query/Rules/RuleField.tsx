import { type ComponentType, useState } from 'react';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import { getValidations } from '~/utils/validations';

type FrescoFieldComponent = ComponentType<Record<string, unknown>>;

type RuleFieldOnChange = (
  eventOrValue: unknown,
  nextValue: unknown,
  currentValue: unknown,
  name: string | null,
) => void;

type RuleFieldProps = {
  component: FrescoFieldComponent;
  label: string;
  onChange: RuleFieldOnChange;
  value?: unknown;
  name?: string;
  options?: unknown[];
  validation?: Record<string, unknown>;
  fromValue?: (value: unknown) => unknown;
  toValue?: (value: unknown) => unknown;
  [key: string]: unknown;
};

const normalizeOption = (option: unknown): unknown => {
  if (typeof option === 'string' || typeof option === 'number') {
    return { value: option, label: String(option) };
  }

  if (option === null || typeof option !== 'object' || !('value' in option)) {
    return option;
  }

  const label = 'label' in option ? option.label : undefined;

  return {
    ...option,
    label: typeof label === 'string' ? label : String(label ?? option.value),
  };
};

/**
 * Controlled field for form plumbing that lives outside redux-form (the
 * Query/Rules editors). Runs the same on-change validation as connected fields
 * and renders a fresco field directly, without fabricating redux-form's
 * input/meta props.
 */
const RuleField = ({
  component,
  label,
  onChange,
  value,
  name,
  options,
  validation = {},
  fromValue,
  toValue,
  ...fieldProps
}: RuleFieldProps) => {
  const [touched, setTouched] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const runValidation = (candidate: unknown): string[] =>
    getValidations(validation).reduce<string[]>((memo, rule) => {
      const result = rule(candidate);
      if (result) {
        memo.push(result);
      }
      return memo;
    }, []);

  const handleChange = (nextValue: unknown) => {
    const converted = toValue ? toValue(nextValue) : nextValue;
    setTouched(true);
    setErrors(runValidation(converted));
    onChange(converted, converted, value, name ?? null);
  };

  const showErrors = touched && errors.length > 0;

  return (
    <UnconnectedField
      {...fieldProps}
      component={component}
      label={label}
      name={name ?? ''}
      options={options == null ? undefined : options.map(normalizeOption)}
      value={fromValue ? fromValue(value) : value}
      onChange={handleChange}
      errors={errors}
      showErrors={showErrors}
      aria-invalid={showErrors}
    />
  );
};

export default RuleField;
