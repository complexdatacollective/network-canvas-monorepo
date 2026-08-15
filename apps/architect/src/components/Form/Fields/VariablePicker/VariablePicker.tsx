import { get, has } from 'es-toolkit/compat';
import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useRef, useState } from 'react';

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const answeredRef = useRef(false);

  /**
   * The picker is a modal opened from INSIDE another modal, so leaving focus on
   * `<body>` when it closes does not just lose the caret: Tab then restarts a
   * document-order walk and steps straight out of the still-open parent dialog.
   * Returning focus to the button that opened it keeps the whole interaction
   * inside the field editor.
   *
   * DISMISSAL ONLY. When the picker is closed by actually choosing (or
   * creating) a variable, the field changes underneath it — a new pill, and for
   * a stage-level picker a whole validation section that mounts below — and
   * focus belongs with that new content, not back on the trigger. Putting it on
   * the trigger there also parks it inside this field's wrapper, whose `onBlur`
   * fires on the researcher's NEXT click anywhere in the form; the re-render
   * that follows swallows that click. An end-to-end run caught it exactly
   * there: the first click on the validation toggle after creating a
   * quick-add variable did nothing, and the variable kept a `required` rule the
   * researcher had turned off. That swallowed-click fragility is not this
   * change's to fix, so this change does not walk into it.
   */
  const finalFocus = useCallback(
    () => (answeredRef.current ? false : triggerRef.current),
    [],
  );

  const handleSelectVariable = (variable: string) => {
    if (disabled || readOnly) return;
    answeredRef.current = true;
    onChange?.(variable);
    setShowPicker(false);
  };

  const handleCreateOption = (variable: string) => {
    if (disabled || readOnly) return;
    answeredRef.current = true;
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
            // `min-w-0`: without it this fieldset's automatic minimum is the
            // min-content of the pill inside, so a long variable name made the
            // whole picker — and the editor around it — refuse to shrink
            // (#1388).
            'bg-input text-input-contrast flex w-full min-w-0 flex-col items-start rounded border-2 p-4',
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
              {/* `w-full`, not shrink-to-fit. The fieldset is `items-start`,
                  so without an explicit width this wrapper takes the pill's
                  own content width — and the pill's `max-width: min(20rem,
                  100%)` then resolves 100% against a box the pill itself
                  sized, which can never clamp anything. Filling the fieldset
                  gives that percentage a real bound to resolve against. */}
              <motion.div
                className="w-full min-w-0"
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
          ref={triggerRef}
          type="button"
          icon={<Plus />}
          onClick={() => {
            answeredRef.current = false;
            setShowPicker(true);
          }}
          color="primary"
          disabled={disabled || readOnly}
          // Names this button as where `focusFirstError` should send focus for
          // this field: it is the control that resolves a "variable is
          // required" error, and it is not the first focusable element in the
          // field once a variable has been picked.
          data-field-focus-target=""
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
        finalFocus={finalFocus}
        options={options}
        onCreateOption={handleCreateOption}
        disallowCreation={disallowCreation}
      />
    </>
  );
};
