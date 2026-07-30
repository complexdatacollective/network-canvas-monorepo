'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ValidationPropsCatalogue } from '@codaco/fresco-ui/form/Field/types';
import FieldErrors from '@codaco/fresco-ui/form/FieldErrors';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { useField } from '@codaco/fresco-ui/form/hooks/useField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { ValidationContext } from '@codaco/fresco-ui/form/store/types';

type AddNodeInputProps = {
  /** Protocol label for the entity being added, e.g. "Person". */
  entityLabel: string;
  /** Codebook variable the quick-add name is written to. */
  targetVariable: string;
  /** Create a node with the given name. The input stays open for the next one. */
  onCreate: (name: string) => Promise<void>;
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
  validationContext,
  ...validationProps
}: AddNodeInputProps) {
  const validateForm = useFormStore((state) => state.validateForm);
  const resetField = useFormStore((state) => state.resetField);
  const [fieldToReset, setFieldToReset] = useState<string>();
  const submissionInProgress = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { id, meta, fieldProps, containerProps } = useField({
    name: targetVariable,
    initialValue: '',
    disabled: isSubmitting,
    validateOnChange: true,
    validateOnChangeDelay: 0,
    validationContext,
    ...validationProps,
  });

  useEffect(() => {
    if (fieldToReset === undefined) return;
    resetField(fieldToReset);
    setFieldToReset(undefined);
  }, [fieldToReset, resetField]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.nativeEvent.isComposing || event.key !== 'Enter') return;
      event.preventDefault();

      void (async () => {
        if (submissionInProgress.current) return;
        submissionInProgress.current = true;
        setIsSubmitting(true);

        try {
          const name =
            typeof fieldProps.value === 'string' ? fieldProps.value.trim() : '';
          fieldProps.onChange(name);

          // Gate on the target variable's codebook validation (required,
          // maxLength, unique, ...) before creating anything.
          const isValid = await validateForm();
          if (!isValid) return;

          // Preserves the pre-existing guard: a blank/whitespace-only name is a
          // silent no-op, independent of codebook rules (no fallback to
          // `required` — a rule-less variable behaves exactly as before).
          if (name === '') return;

          await onCreate(name);
          setFieldToReset(targetVariable);
        } finally {
          submissionInProgress.current = false;
          setIsSubmitting(false);
        }
      })();
    },
    [validateForm, fieldProps, onCreate, targetVariable],
  );

  return (
    <div {...containerProps} className="flex w-72 flex-col">
      <InputField
        // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: the
        // popover exists to capture a name, so focus belongs here on open.
        autoFocus
        aria-label={`${entityLabel} name`}
        placeholder="Type a name, then press Enter"
        id={id}
        name={targetVariable}
        {...fieldProps}
        value={fieldProps.value as string}
        onChange={fieldProps.onChange}
        onKeyDown={handleKeyDown}
      />
      <FieldErrors
        id={`${id}-error`}
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
