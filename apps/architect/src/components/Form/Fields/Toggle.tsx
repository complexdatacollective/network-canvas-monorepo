import { isBoolean } from 'es-toolkit/compat';
import type { ComponentProps, ComponentType } from 'react';
import { useEffect, useRef } from 'react';
import type { WrappedFieldMetaProps } from 'redux-form';

import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import FrescoReduxField from '~/components/Form/FrescoReduxField';

type ToggleProps = {
  label?: string | null;
  title?: string;
  fieldLabel?: string | null;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  input: {
    name?: string;
    value?: unknown;
    onChange: (value: boolean) => void;
    onBlur?: (value?: unknown) => void;
    onFocus?: () => void;
  };
  meta?: Partial<WrappedFieldMetaProps>;
  [key: string]: unknown;
};

const ReduxToggleControl = ({
  onBlur,
  onFocus,
  ...props
}: ComponentProps<typeof ToggleField>) => (
  <span onBlur={onBlur} onFocus={onFocus}>
    <ToggleField {...props} />
  </span>
);

const FrescoToggleField = ReduxToggleControl as ComponentType<
  Record<string, unknown>
>;
const ReduxFieldAdapter = FrescoReduxField as ComponentType<
  Record<string, unknown>
>;

const Toggle = ({
  label = null,
  title = '',
  fieldLabel = null,
  className = '',
  disabled = false,
  readOnly = false,
  input,
  meta = {},
  ...fieldProps
}: ToggleProps) => {
  const initialized = useRef(false);
  const inputOnChange = input.onChange;
  const inputValue = input.value;

  // Redux Form omits an untouched field's value. Persist the explicit false
  // default so serialization and dependent fields see a boolean immediately.
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (!isBoolean(inputValue)) {
      inputOnChange(false);
    }
  }, [inputOnChange, inputValue]);

  const resolvedLabel =
    label ?? (fieldLabel?.trim() ? fieldLabel : (input.name ?? ''));

  return (
    <ReduxFieldAdapter
      {...fieldProps}
      input={input}
      meta={meta}
      fieldComponent={FrescoToggleField}
      label={resolvedLabel}
      inline
      title={title}
      className={className}
      disabled={disabled}
      readOnly={readOnly}
      fromReduxValue={(value: unknown) => Boolean(value)}
      toReduxValue={(value: unknown) => Boolean(value)}
    />
  );
};

export default Toggle;
