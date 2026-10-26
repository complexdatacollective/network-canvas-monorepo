'use client';

import { useContext, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import { validateFieldValue } from '@codaco/fresco-ui/form/validation/helpers';
import isUnanswered from '@codaco/fresco-ui/form/validation/utils/isUnanswered';

/**
 * Whether a participant-facing form is finished enough for Next to light up:
 * every answer passes its checks, no error is on display, and every question
 * has either been answered or been seen (the form has been scrolled to its
 * end). A long form whose optional questions are left blank only counts as
 * finished once it has been scrolled through.
 *
 * The answers are checked silently against their current values. The store's
 * own `isValid` cannot say: a field with checks counts as invalid until it has
 * been validated, which only happens once the participant leaves it, so
 * answers already given (or typed into the last question without leaving it)
 * would never count.
 *
 * Call inside the form's `FormStoreProvider`.
 */
export default function useFormReadyToContinue(hasScrolledToBottom: boolean) {
  const storeApi = useContext(FormStoreContext);
  const fieldValues = useFormStore(
    useShallow((s) => Array.from(s.fields.values(), (field) => field.value)),
  );
  const hasErrors = useFormStore(
    (s) =>
      s.errors.formErrors.length > 0 ||
      Object.values(s.errors.fieldErrors).some(
        (messages) => messages && messages.length > 0,
      ),
  );
  const allAnswered = fieldValues.every((value) => !isUnanswered(value));

  // A stale pass from the previous values stands until the new check settles
  // (a microtask for the built-in checks). Clearing it first would switch the
  // highlight off and on with every keystroke; Next validates in full anyway.
  const [answersPass, setAnswersPass] = useState(false);
  useEffect(() => {
    if (!storeApi) return undefined;
    let current = true;
    const { fields, getFormValues } = storeApi.getState();
    const formValues = getFormValues();
    void Promise.all(
      Array.from(fields.values(), (field) =>
        field.validation
          ? validateFieldValue(field.value, field.validation, formValues).then(
              (result) => result.success,
              () => false,
            )
          : true,
      ),
    ).then((results) => {
      if (current) setAnswersPass(results.every(Boolean));
    });
    return () => {
      current = false;
    };
  }, [storeApi, fieldValues]);

  return (
    fieldValues.length > 0 &&
    answersPass &&
    !hasErrors &&
    (allAnswered || hasScrolledToBottom)
  );
}
