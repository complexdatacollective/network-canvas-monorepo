import { get, has } from 'es-toolkit/compat';
import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type ComponentType, type FocusEventHandler } from 'react';
import type { WrappedFieldProps } from 'redux-form';

import Button from '@codaco/fresco-ui/Button';
import type { VariableType } from '@codaco/protocol-validation';
import { cx } from '~/utils/cva';

import FrescoReduxField from '../../FrescoReduxField';
import EditableVariablePill, { SimpleVariablePill } from './VariablePill';
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
      return <EditableVariablePill uuid={selectedOption.value} />;
    }

    const selectedLabel = get(selectedOption, 'label', null);
    const selectedValue = get(selectedOption, 'value', null);
    const finalLabel = selectedLabel || selectedValue || '';
    const variableType = (selectedOption.type ?? 'text') as VariableType;

    return (
      <SimpleVariablePill label={finalLabel} type={variableType}>
        <span />
      </SimpleVariablePill>
    );
  };

  return (
    <>
      <fieldset
        id={id}
        aria-labelledby={ariaLabelledBy ?? (id ? `${id}-label` : undefined)}
        aria-describedby={ariaDescribedBy}
        aria-disabled={readOnly || undefined}
        disabled={disabled}
        data-name={name}
        onBlur={onBlur}
        onFocus={onFocus}
        className={cx(
          'bg-input text-input-contrast flex w-full flex-col items-start gap-4 rounded border-2 border-transparent p-4',
          ariaInvalid && 'border-destructive',
          disabled && 'opacity-50',
          readOnly && 'opacity-70',
          '[&_.variable-pill]:mb-0',
        )}
      >
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
        <Button
          type="button"
          icon={<Plus />}
          onClick={() => setShowPicker(true)}
          color="primary"
          disabled={disabled || readOnly}
        >
          {value ? 'Change variable' : 'Select variable'}
        </Button>
      </fieldset>
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
  options?: VariableOption[];
  onCreateOption?: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
};

const FrescoVariablePickerControl = VariablePickerControl as ComponentType<
  Record<string, unknown>
>;
const ReduxFieldAdapter = FrescoReduxField as unknown as ComponentType<
  Record<string, unknown>
>;

const VariablePickerBase = ({
  label = 'Create or select a variable',
  ...props
}: VariablePickerProps) => (
  <ReduxFieldAdapter
    {...props}
    label={label}
    fieldComponent={FrescoVariablePickerControl}
  />
);

const VariablePicker = VariablePickerBase as unknown as ComponentType<
  Record<string, unknown>
>;

export default VariablePicker;
