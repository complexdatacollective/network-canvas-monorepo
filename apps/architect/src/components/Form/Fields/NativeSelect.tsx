import type { UnknownAction } from '@reduxjs/toolkit';
import { sortBy } from 'es-toolkit/compat';
import { AnimatePresence, motion } from 'motion/react';
import type { ComponentType } from 'react';
import { useCallback, useMemo, useState } from 'react';
import type { WrappedFieldInputProps, WrappedFieldMetaProps } from 'redux-form';
import { untouch } from 'redux-form';

import Button from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import { useAppDispatch } from '~/ducks/hooks';
import { cx } from '~/utils/cva';
import { getValidator } from '~/utils/validations';

import { getReduxFieldErrorState } from '../reduxFieldMeta';

type Option = {
  label: string;
  value: string;
  disabled?: boolean;
};

type NativeSelectProps = {
  className?: string;
  label?: string | null;
  options?: Option[];
  placeholder?: string;
  onCreateOption?: (value: string) => Promise<void> | void;
  onCreateNew?: () => void;
  createLabelText?: string;
  createInputLabel?: string;
  createInputPlaceholder?: string;
  allowPlaceholderSelect?: boolean;
  sortOptionsByLabel?: boolean;
  reserved?: Option[];
  validation?: Record<string, unknown> | null;
  required?: boolean;
  disabled?: boolean;
  input: WrappedFieldInputProps;
  meta?: Partial<WrappedFieldMetaProps> & { form?: string };
  entity?: string;
};

const FrescoInputField = InputField as ComponentType<Record<string, unknown>>;
const FrescoNativeSelectField = NativeSelectField as ComponentType<
  Record<string, unknown>
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

const NativeSelect = ({
  label = null,
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
  validation = null,
  required = false,
  disabled = false,
  input,
  meta = {},
  entity,
}: NativeSelectProps) => {
  const [showCreateOptionForm, setShowCreateOptionForm] = useState(false);
  const [newOptionValue, setNewOptionValue] = useState<string | null>(null);
  const [createRequestError, setCreateRequestError] = useState<string | false>(
    false,
  );
  const [isCreating, setIsCreating] = useState(false);
  const dispatch = useAppDispatch();
  const { errors: parentErrors, showErrors: showParentErrors } =
    getReduxFieldErrorState(meta as WrappedFieldMetaProps);

  const untouchParent = useCallback(() => {
    if (!meta.form) return;
    dispatch(untouch(meta.form, input.name) as UnknownAction);
  }, [dispatch, input.name, meta.form]);

  const resetForm = useCallback(() => {
    setShowCreateOptionForm(false);
    setNewOptionValue(null);
    setCreateRequestError(false);
    setIsCreating(false);
  }, []);

  const handleSelectChange = (nextValue: unknown) => {
    const value = asStringValue(nextValue);

    if (value === '_create') {
      input.onChange(null);
      // Clearing the select touches the Redux field. Creation starts a separate
      // interaction, so keep the parent pristine until the user submits it.
      untouchParent();

      if (onCreateNew) {
        onCreateNew();
        return;
      }

      setNewOptionValue(null);
      setShowCreateOptionForm(true);
      return;
    }

    input.onChange(value === '' ? null : value);
  };

  const getCreateOptionError = useCallback(
    (value: string | null): string | false => {
      if (!value) return false;

      const validationError = getValidator(validation ?? {})(value);
      if (validationError) return validationError;

      const matchesLabel = ({ label: optionLabel }: Option) =>
        optionLabel.toLowerCase() === value.toLowerCase();

      if (options.some(matchesLabel) || reserved.some(matchesLabel)) {
        return `An option named "${value}" is already defined${entity ? ` on entity type ${entity}` : ''}`;
      }

      return false;
    },
    [entity, options, reserved, validation],
  );

  const createOptionError = useMemo(
    () => getCreateOptionError(newOptionValue),
    [getCreateOptionError, newOptionValue],
  );
  const valueButNotSubmitted = newOptionValue !== null;
  const notSubmittedError = valueButNotSubmitted
    ? 'You must click "create" to finish creating this option.'
    : false;
  const createError =
    createOptionError ||
    createRequestError ||
    notSubmittedError ||
    parentErrors[0] ||
    false;
  const showCreateError = Boolean(
    createOptionError ||
    createRequestError ||
    ((meta.touched || meta.submitFailed) && createError),
  );

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
              component={FrescoInputField}
              name={`${input.name}-create`}
              label={createInputLabel}
              autoFocus
              required
              placeholder={createInputPlaceholder}
              value={newOptionValue ?? ''}
              onChange={(value: unknown) => {
                untouchParent();
                setCreateRequestError(false);
                setNewOptionValue(asStringValue(value));
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
            <UnconnectedField
              component={FrescoNativeSelectField}
              name={input.name}
              label={label ?? input.name}
              options={selectOptions}
              value={input.value ?? ''}
              onChange={handleSelectChange}
              onBlur={() => input.onBlur(input.value)}
              onFocus={input.onFocus}
              disabled={disabled}
              required={required || Boolean(validation?.required)}
              errors={parentErrors}
              showErrors={showParentErrors}
              aria-invalid={showParentErrors}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default NativeSelect;
