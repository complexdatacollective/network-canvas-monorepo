import { get, has } from 'es-toolkit/compat';
import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  useId,
  useState,
  type ComponentType,
  type FocusEventHandler,
  type ReactNode,
} from 'react';
import type { WrappedFieldProps } from 'redux-form';

import Button from '@codaco/fresco-ui/Button';
import FieldErrors from '@codaco/fresco-ui/form/FieldErrors';
import Hint from '@codaco/fresco-ui/form/Hint';
import { Label } from '@codaco/fresco-ui/Label';
import type { VariableType } from '@codaco/protocol-validation';
import { ConnectedVariablePill, VariablePill } from '~/components/VariablePill';
import { cx } from '~/utils/cva';

import { getReduxFieldErrorState } from '../../reduxFieldMeta';
import VariableSpotlight from './VariableSpotlight';

export type VariableOption = {
  label: string;
  value: string;
  type?: string;
};

type VariablePickerControlProps = {
  'id'?: string;
  'name'?: string;
  'value'?: string;
  'onChange'?: (value: string) => void;
  'onBlur'?: FocusEventHandler;
  'onFocus'?: FocusEventHandler;
  'disallowCreation'?: boolean;
  'entity'?: string | null;
  'type'?: string | null;
  'options'?: VariableOption[];
  'onCreateOption'?: (value: string) => void;
  'disabled'?: boolean;
  'readOnly'?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-labelledby'?: string;
};

export const VariablePickerControl = ({
  id,
  name,
  value,
  onChange,
  onBlur,
  onFocus,
  options = [],
  entity,
  type,
  onCreateOption = () => {},
  disallowCreation = false,
  disabled = false,
  readOnly = false,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
}: VariablePickerControlProps) => {
  const [showPicker, setShowPicker] = useState(false);

  const handleSelectVariable = (variable: string) => {
    if (disabled || readOnly) return;
    onChange?.(variable);
    setShowPicker(false);
  };

  const handleCreateOption = (variable: string) => {
    if (disabled || readOnly) return;
    onChange?.('');
    setShowPicker(false);
    onCreateOption(variable);
  };

  const selectedOption = options.find(
    ({ label: variableLabel, value: variableValue }) =>
      value === variableValue || value === variableLabel,
  );

  const variablePill = () => {
    if (!selectedOption) return null;

    if (has(selectedOption, 'type') && selectedOption.type) {
      return (
        <ConnectedVariablePill animated editable uuid={selectedOption.value} />
      );
    }

    const selectedLabel = get(selectedOption, 'label', null);
    const selectedValue = get(selectedOption, 'value', null);
    const finalLabel = selectedLabel || selectedValue || '';
    const variableType = (selectedOption.type ?? 'text') as VariableType;

    return <VariablePill label={finalLabel} type={variableType} />;
  };

  return (
    <>
      <div
        data-name={name}
        onBlur={onBlur}
        onFocus={onFocus}
        className="flex w-full flex-col items-start gap-4"
      >
        <fieldset
          id={id}
          aria-labelledby={ariaLabelledBy ?? (id ? `${id}-label` : undefined)}
          aria-describedby={ariaDescribedBy}
          aria-disabled={readOnly || undefined}
          disabled={disabled}
          className={cx(
            'bg-input text-input-contrast flex w-full flex-col items-start rounded border-2 p-4',
            ariaInvalid && 'border-destructive',
            disabled && 'opacity-50',
            readOnly && 'opacity-70',
            '[&_.variable-pill]:mb-0',
          )}
        >
          {!value && (
            <p className="w-full py-6 text-center text-sm text-current/70 italic">
              No variable selected
            </p>
          )}
          {value && (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                key={value}
              >
                {variablePill()}
              </motion.div>
            </AnimatePresence>
          )}
        </fieldset>
        <Button
          type="button"
          icon={<Plus />}
          onClick={() => setShowPicker(true)}
          color="primary"
          disabled={disabled || readOnly}
        >
          {value ? 'Change variable' : 'Select variable'}
        </Button>
      </div>
      <VariableSpotlight
        open={showPicker}
        onOpenChange={(open) => {
          if (!disabled && !readOnly) setShowPicker(open);
        }}
        entity={entity ?? undefined}
        type={type ?? undefined}
        onSelect={handleSelectVariable}
        onCancel={() => setShowPicker(false)}
        options={options}
        onCreateOption={handleCreateOption}
        disallowCreation={disallowCreation}
      />
    </>
  );
};

type VariablePickerProps = WrappedFieldProps & {
  disallowCreation?: boolean;
  entity?: string | null;
  type?: string | null;
  label?: string;
  hint?: ReactNode;
  options?: VariableOption[];
  onCreateOption?: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
};

const VariablePickerBase = ({
  input,
  meta,
  label = 'Create or select a variable',
  hint,
  required = false,
  ...props
}: VariablePickerProps) => {
  const id = useId();
  const { errors, showErrors } = getReduxFieldErrorState(meta);
  const describedBy = [
    required && `${id}-required`,
    hint && `${id}-hint`,
    errors.length > 0 && `${id}-error`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className="group flex w-full grow flex-col not-last:mb-8"
      data-field-name={input.name}
    >
      <div className="mb-2">
        <Label id={`${id}-label`} htmlFor={id} required={required}>
          {label}
        </Label>
        {required && (
          <span id={`${id}-required`} className="sr-only">
            Required
          </span>
        )}
        {hint && <Hint id={`${id}-hint`}>{hint}</Hint>}
      </div>
      <VariablePickerControl
        {...props}
        id={id}
        name={input.name}
        value={typeof input.value === 'string' ? input.value : undefined}
        onChange={(value) => input.onChange(value)}
        onBlur={() => input.onBlur?.(undefined)}
        onFocus={input.onFocus}
        aria-labelledby={`${id}-label`}
        aria-describedby={describedBy || undefined}
        aria-invalid={showErrors}
      />
      <FieldErrors
        id={`${id}-error`}
        name={input.name}
        errors={errors}
        show={showErrors}
      />
    </div>
  );
};

const VariablePicker = VariablePickerBase as unknown as ComponentType<
  Record<string, unknown>
>;

export default VariablePicker;
