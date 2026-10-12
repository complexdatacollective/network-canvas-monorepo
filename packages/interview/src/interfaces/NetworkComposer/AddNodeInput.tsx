'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { fieldElementIds } from '@codaco/fresco-ui/form/Field/fieldElements';
import type { ValidationPropsCatalogue } from '@codaco/fresco-ui/form/Field/types';
import FieldErrors from '@codaco/fresco-ui/form/FieldErrors';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { useField } from '@codaco/fresco-ui/form/hooks/useField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { ValidationContext } from '@codaco/fresco-ui/form/store/types';

import { useTrackWrite } from '../../store/WritesInFlightContext';
import { interfaceMessages } from '../messages';

type AddNodeInputProps = {
  /** Protocol label for the entity being added, e.g. "Person". */
  entityLabel: string;
  /** Codebook variable the quick-add name is written to. */
  targetVariable: string;
  /**
   * Create a node with the given name, resolving whether it was created. The
   * input stays open for the next one, and keeps a name that was not saved.
   */
  onCreate: (name: string) => Promise<boolean>;
  /** Told when a name starts and stops being checked and added. */
  onAddingChange?: (adding: boolean) => void;
  /**
   * Context required for context-dependent validations like unique, sameAs,
   * etc. — forwarded to useField exactly as QuickNodeForm's quick-add field
   * forwards it.
   */
  validationContext?: ValidationContext;
} & Partial<ValidationPropsCatalogue>;

/**
 * The field itself. Split out from AddNodeInput so it renders inside the
 * FormStoreProvider AddNodeInput establishes below — useField needs that
 * context to register the field and run its codebook-derived validation.
 *
 * This isn't a Field-compatible surface (no <Form>/<Field>, no submit
 * button): Enter both submits and immediately clears the field so several
 * names can be entered in a row. So it wires useField's validation directly
 * rather than going through <Field>, gating creation on a manual
 * `validateForm()` call before deciding whether to create the node.
 */
function AddNodeField({
  entityLabel,
  targetVariable,
  onCreate,
  onAddingChange,
  validationContext,
  ...validationProps
}: AddNodeInputProps) {
  const intl = useAppIntl();
  const trackWrite = useTrackWrite();
  const validateForm = useFormStore((state) => state.validateForm);
  const pathOperations = useFormStore((state) => state.pathOperations);
  const resetField = useFormStore((state) => state.resetField);
  const [fieldToReset, setFieldToReset] = useState<{ name: string }>();
  const submissionInProgress = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldRestoreFocus = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { id, meta, fieldProps, containerProps } = useField({
    name: targetVariable,
    nameMode: 'opaque',
    initialValue: '',
    disabled: isSubmitting,
    validateOnChange: true,
    validateOnChangeDelay: 0,
    validationContext,
    // This field is not wrapped in a BaseField: the only element it renders
    // around the control is its own FieldErrors region below, so that is the
    // only one `fieldProps` may name. It takes its accessible name from
    // `aria-label`, so there is no label element to point at either.
    renderedElements: { error: true },
    ...validationProps,
  });

  // The request itself is what gets consumed, not the field it names: two
  // submissions in a row reset the same field and each still needs its own
  // reset, while a re-render that only changed `resetField`'s identity does
  // not.
  const appliedResetRef = useRef<{ name: string } | undefined>(undefined);
  useEffect(() => {
    if (fieldToReset === undefined) return;
    if (appliedResetRef.current === fieldToReset) return;
    appliedResetRef.current = fieldToReset;
    if (pathOperations) {
      pathOperations.resetField([fieldToReset.name]);
    } else {
      resetField(fieldToReset.name);
    }
  }, [fieldToReset, pathOperations, resetField]);

  useEffect(() => {
    if (isSubmitting || !shouldRestoreFocus.current) return;
    shouldRestoreFocus.current = false;
    inputRef.current?.focus();
  }, [isSubmitting]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.nativeEvent.isComposing || event.key !== 'Enter') return;
      event.preventDefault();
      if (submissionInProgress.current) return;
      submissionInProgress.current = true;
      shouldRestoreFocus.current = true;
      setIsSubmitting(true);
      onAddingChange?.(true);

      // The name counts as being saved from Enter, while it is still being
      // checked, so leaving the stage waits for it.
      const adding = (async () => {
        try {
          const name =
            typeof fieldProps.value === 'string' ? fieldProps.value.trim() : '';
          fieldProps.onChange(name);

          // Gate on the target variable's codebook validation (required,
          // maxLength, unique, ...) before creating anything.
          const isValid = await validateForm();
          if (!isValid) return false;

          // Preserves the pre-existing guard: a blank/whitespace-only name is a
          // silent no-op, independent of codebook rules (no fallback to
          // `required` — a rule-less variable behaves exactly as before).
          if (name === '') return true;

          const created = await onCreate(name);
          if (created) setFieldToReset({ name: targetVariable });
          return created;
        } finally {
          submissionInProgress.current = false;
          setIsSubmitting(false);
          onAddingChange?.(false);
        }
      })();
      trackWrite(adding);
    },
    [
      validateForm,
      fieldProps,
      onCreate,
      onAddingChange,
      targetVariable,
      trackWrite,
    ],
  );

  return (
    <div {...containerProps} className="flex w-72 flex-col">
      <InputField
        // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: the
        // popover exists to capture a name, so focus belongs here on open.
        autoFocus
        aria-label={intl.formatMessage(interfaceMessages.entityName, {
          entityLabel,
        })}
        placeholder={intl.formatMessage(interfaceMessages.addNamePlaceholder)}
        id={id}
        name={targetVariable}
        {...fieldProps}
        ref={inputRef}
        value={fieldProps.value as string}
        onChange={fieldProps.onChange}
        onKeyDown={handleKeyDown}
      />
      <FieldErrors
        id={fieldElementIds(id).error}
        name={targetVariable}
        errors={meta.errors}
        show={meta.shouldShowError}
      />
    </div>
  );
}

export default function AddNodeInput(props: AddNodeInputProps) {
  return (
    <FormStoreProvider>
      <AddNodeField {...props} />
    </FormStoreProvider>
  );
}
