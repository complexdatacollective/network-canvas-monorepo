import { get, has } from 'es-toolkit/compat';
import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import type { VariableType } from '@codaco/protocol-validation';
import { ConnectedVariablePill, VariablePill } from '~/components/VariablePill';
import { cx } from '~/utils/cva';

import VariableSpotlight from './VariableSpotlight';

export type VariableOption = {
  label: string;
  value: string;
  type?: string;
};

type VariablePickerProps = CreateFormFieldProps<
  string,
  'div',
  {
    /** Hides the spotlight's "create a new variable" affordance. */
    disallowCreation?: boolean;
    /** Narrows the spotlight to one entity ('node' | 'edge' | 'ego'). */
    entity?: string | null;
    /** Narrows the spotlight to one entity type. */
    type?: string | null;
    options?: VariableOption[];
    onCreateOption?: (value: string) => void;
  }
>;

/**
 * Selects (or creates) a codebook variable. Labelling belongs to the
 * surrounding field — pass it through `ArchitectField`'s `label`/`hint`.
 */
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
}: VariablePickerProps) => {
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

export default VariablePickerControl;
