import { sortBy } from 'es-toolkit/compat';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useMemo, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import { cx } from '~/utils/cva';
import { getValidator } from '~/utils/validations';

import type { ArchitectValidation } from '../toZodValidation';

type Option = {
  label: string;
  value: string;
  disabled?: boolean;
};

type NativeSelectProps = CreateFormFieldProps<
  string,
  'div',
  {
    options?: Option[];
    placeholder?: string;
    /** Creates the option inline, in this control. */
    onCreateOption?: (value: string) => Promise<void> | void;
    /** Hands creation to an external flow (a dialog) instead. */
    onCreateNew?: () => void;
    createLabelText?: string;
    createInputLabel?: string;
    createInputPlaceholder?: string;
    allowPlaceholderSelect?: boolean;
    sortOptionsByLabel?: boolean;
    /** Names that are taken but not selectable, e.g. reserved variable names. */
    reserved?: Option[];
    /** Rules applied to a newly typed option name, not to the selection. Named
     * apart from `ArchitectField`'s own `validation` prop, which it would
     * otherwise be swallowed by. */
    createValidation?: ArchitectValidation | null;
    /** Named in the "already defined" message for a duplicate option. */
    entity?: string;
  }
>;

const variants = {
  show: { opacity: 1 },
  hide: { opacity: 0 },
  transition: { duration: 0.5 },
};

const asStringValue = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
};

/**
 * Native select with an optional inline "create a new option" flow. The
 * field's own label and hint come from the call site through `ArchitectField`;
 * the create form's input carries its own label because it is a separate
 * control that only exists while creating.
 */
const NativeSelect = ({
  id,
  name = '',
  value,
  onChange,
  onBlur,
  onFocus,
  options = [],
  placeholder = 'Select an option',
  className = '',
  onCreateOption,
  onCreateNew,
  createLabelText = '✨ Create new ✨',
  createInputLabel = 'New variable name',
  createInputPlaceholder = 'Enter a variable name...',
  allowPlaceholderSelect = false,
  sortOptionsByLabel = true,
  reserved = [],
  createValidation = null,
  entity,
  disabled = false,
  readOnly = false,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-required': ariaRequired,
}: NativeSelectProps) => {
  const [showCreateOptionForm, setShowCreateOptionForm] = useState(false);
  const [newOptionValue, setNewOptionValue] = useState<string | null>(null);
  const [createRequestError, setCreateRequestError] = useState<string | false>(
    false,
  );
  const [isCreating, setIsCreating] = useState(false);

  const resetForm = useCallback(() => {
    setShowCreateOptionForm(false);
    setNewOptionValue(null);
    setCreateRequestError(false);
    setIsCreating(false);
  }, []);

  const handleSelectChange = (nextValue: unknown) => {
    const selected = asStringValue(nextValue);

    if (selected === '_create') {
      onChange?.(undefined);

      if (onCreateNew) {
        onCreateNew();
        return;
      }

      setNewOptionValue(null);
      setShowCreateOptionForm(true);
      return;
    }

    onChange?.(selected === '' ? undefined : selected);
  };

  const getCreateOptionError = useCallback(
    (candidate: string | null): string | false => {
      if (!candidate) return false;

      const validationError = getValidator(createValidation ?? {})(candidate);
      if (validationError) return validationError;

      const matchesLabel = ({ label: optionLabel }: Option) =>
        optionLabel.toLowerCase() === candidate.toLowerCase();

      if (options.some(matchesLabel) || reserved.some(matchesLabel)) {
        return `An option named "${candidate}" is already defined${entity ? ` on entity type ${entity}` : ''}`;
      }

      return false;
    },
    [entity, options, reserved, createValidation],
  );

  const createOptionError = useMemo(
    () => getCreateOptionError(newOptionValue),
    [getCreateOptionError, newOptionValue],
  );
  // No separate "you must click create to finish" nudge: the surrounding
  // field renders its own required error under the create form when a submit
  // is attempted with nothing selected.
  const createError = createOptionError || createRequestError || false;
  const showCreateError = Boolean(createError);

  const handleCreateOption = async () => {
    if (!onCreateOption || !newOptionValue || createOptionError || isCreating) {
      return;
    }

    setIsCreating(true);
    setCreateRequestError(false);
    try {
      await onCreateOption(newOptionValue);
      resetForm();
    } catch (error) {
      setCreateRequestError(
        error instanceof Error && error.message
          ? error.message
          : 'Unable to create this option.',
      );
      setIsCreating(false);
    }
  };

  const sortedOptions = useMemo(
    () => (sortOptionsByLabel ? sortBy(options, 'label') : options),
    [options, sortOptionsByLabel],
  );

  const selectOptions = useMemo<Option[]>(
    () => [
      {
        value: '',
        label: `-- ${placeholder} --`,
        disabled: !allowPlaceholderSelect,
      },
      ...(onCreateOption || onCreateNew
        ? [{ value: '_create', label: createLabelText }]
        : []),
      ...sortedOptions,
    ],
    [
      allowPlaceholderSelect,
      createLabelText,
      onCreateNew,
      onCreateOption,
      placeholder,
      sortedOptions,
    ],
  );

  return (
    <motion.div
      className={cx('flex-1', disabled && 'cursor-not-allowed', className)}
    >
      <AnimatePresence initial={false} mode="wait">
        {showCreateOptionForm ? (
          <motion.div
            className="bg-surface-2 rounded p-5"
            key="new-section"
            variants={variants}
            initial="hide"
            exit="hide"
            animate="show"
          >
            <UnconnectedField
              component={InputField}
              name={`${name}-create`}
              label={createInputLabel}
              autoFocus
              required
              placeholder={createInputPlaceholder}
              value={newOptionValue ?? ''}
              onChange={(nextValue: unknown) => {
                setCreateRequestError(false);
                setNewOptionValue(asStringValue(nextValue));
              }}
              errors={createError ? [createError] : []}
              showErrors={showCreateError}
              aria-invalid={showCreateError}
            />
            <div className="flex items-center justify-end gap-2.5 [&_button]:min-w-40">
              <Button color="default" onClick={resetForm}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleCreateOption()}
                disabled={
                  !newOptionValue || Boolean(createOptionError) || isCreating
                }
              >
                {isCreating ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="select-section"
            initial="hide"
            variants={variants}
            exit="hide"
            animate="show"
          >
            <NativeSelectField
              id={id}
              name={name}
              options={selectOptions}
              value={value ?? ''}
              onChange={handleSelectChange}
              onBlur={onBlur}
              onFocus={onFocus}
              disabled={disabled}
              readOnly={readOnly}
              required={Boolean(ariaRequired)}
              aria-labelledby={ariaLabelledBy}
              aria-describedby={ariaDescribedBy}
              aria-invalid={ariaInvalid}
              aria-required={ariaRequired}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default NativeSelect;
