'use client';

import {
  type SyntheticEvent,
  useCallback,
  useLayoutEffect,
  useRef,
} from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';

import type { FlattenedErrors, FormConfig } from '../store/types';
import useFormStore from './useFormStore';

// Exported so the interview runtime reuses the same participant-facing text
// for a form whose submit handler fails, rather than repeating it.
export const formMessages = defineMessages({
  submitFailed: {
    id: 'frescoUi.form.submitFailed',
    defaultMessage: 'An error occurred while submitting the form.',
    description:
      'Form-level error shown when the submit handler itself throws, so it produced no message of its own.',
  },
});

export function useForm(config: FormConfig) {
  const registeredRef = useRef(false);
  const configRef = useRef(config); // Config is static, so this avoids needing to specify it in effect deps
  configRef.current = config;
  // Store errors are always an object (never null)
  const errorsRef = useRef<FlattenedErrors>({
    formErrors: [],
    fieldErrors: {},
  });
  /**
   * The errors that caused the pending focus request, when the caller already
   * holds them. A submission RESULT is keyed the way the submit handler
   * returned it, which is what `onSubmitInvalid` is documented to receive; the
   * store's copy of the same errors has been renamed onto internal field
   * paths. Client-side validation leaves this null, because at request time
   * the new errors have not been committed yet — the layout effect reads them
   * off the commit instead.
   */
  const requestedErrorsRef = useRef<FlattenedErrors | null>(null);
  /**
   * Whether a submission is running, from the start of `handleSubmit` to its
   * `finally`. A ref rather than the store's `isSubmitting`: the callback
   * would read that from the render before the submission began, and a second
   * submit event can arrive before React re-renders.
   */
  const submissionInFlightRef = useRef(false);

  const registerForm = useFormStore((state) => state.registerForm);
  const validateForm = useFormStore((state) => state.validateForm);
  const getFormValues = useFormStore((state) => state.getFormValues);
  const getFormErrors = useFormStore((state) => state.getFormErrors);
  const reset = useFormStore((state) => state.reset);
  const setErrors = useFormStore((state) => state.setErrors);
  const setSubmitting = useFormStore((state) => state.setSubmitting);
  const requestErrorFocus = useFormStore((state) => state.requestErrorFocus);
  const errors = useFormStore((state) => state.errors);
  const errorFocusRequest = useFormStore((state) => state.errorFocusRequest);
  const submitInvalidHandler = useFormStore(
    (state) => state.submitInvalidHandler,
  );
  const isSubmitting = useFormStore((state) => state.isSubmitting);

  // Keep errors ref in sync with store using useEffect
  useLayoutEffect(() => {
    errorsRef.current = errors;
  }, [errors]);

  /**
   * A store reset (`ResetFormWhenClosed` runs one when its dialog closes)
   * clears `isSubmitting`, but the submission it interrupted is still running
   * and still holds the guard. Report it as submitting again, so the form
   * shows busy and disabled rather than a submit control that does nothing.
   * A layout effect, so the cleared state is never painted.
   */
  useLayoutEffect(() => {
    if (submissionInFlightRef.current && !isSubmitting) setSubmitting(true);
  }, [isSubmitting, setSubmitting]);

  /**
   * Run the invalid-submit handler once React has COMMITTED the errors.
   *
   * A layout effect is what makes the handler's focus deterministic: it runs
   * after the mutation phase of the commit that rendered the error state, so
   * the error elements exist AND React's own focus restoration for that commit
   * has already happened. Deferring by a timer instead — what every call site
   * used to do — parked focus on `document.body` for the length of the wait
   * and raced whatever that commit did with focus, which is how an invalid
   * submission could lose the correction target altogether.
   *
   * Declared after the ref sync above so `errorsRef` already holds this
   * commit's errors: effects within a component run in declaration order.
   *
   * The handler comes from the STORE rather than from this hook's own config,
   * so a host that registers one directly reaches it too — and so the store's
   * registered handler stays the single place the behaviour lives.
   */
  const handledFocusRequestRef = useRef(errorFocusRequest);
  useLayoutEffect(() => {
    // Compared against the count seen at MOUNT rather than against zero: a
    // form remounting inside a store that already counted a request must not
    // read that history as a fresh one and move focus nobody asked it to move.
    if (errorFocusRequest === handledFocusRequestRef.current) return;
    handledFocusRequestRef.current = errorFocusRequest;
    const requestedErrors = requestedErrorsRef.current ?? errorsRef.current;
    requestedErrorsRef.current = null;
    submitInvalidHandler?.(requestedErrors);
  }, [errorFocusRequest, submitInvalidHandler]);

  // Register form once on mount. layout effect used to ensure it runs before fields register.
  useLayoutEffect(() => {
    if (!registeredRef.current) {
      registerForm({
        onSubmit: configRef.current.onSubmit,
        onSubmitInvalid: configRef.current.onSubmitInvalid,
      });
      registeredRef.current = true;
    }

    return () => {
      if (registeredRef.current) {
        reset();
        registeredRef.current = false;
      }
    };
  }, [reset, registerForm]);

  const handleSubmit = useCallback(
    async (e: SyntheticEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // `SubmitButton` and fields disable themselves while submitting, but a
      // submit can still come from `requestSubmit()`, another submit control,
      // or Enter in an input that is not a field. Running it would validate
      // and call `onSubmit` again, saving the same values twice.
      if (submissionInFlightRef.current) return;
      submissionInFlightRef.current = true;
      setSubmitting(true);

      try {
        const isValid = await validateForm(); // Run field level validation
        if (!isValid) {
          // Hand off to the layout effect above, which fires once the errors
          // this validation produced have been committed to the DOM.
          requestErrorFocus();
          return;
        }

        const values = getFormValues();

        const result = await configRef.current.onSubmit?.(values);

        if (result.success) {
          // Clear errors on successful submission
          setErrors(null);
          return;
        }

        // Handle the submission result. Surface returned field errors using the
        // same invalid-submit path as client validation so the first control is
        // focused after the error UI renders.
        const submissionErrors: FlattenedErrors = {
          formErrors: result.formErrors ?? [],
          fieldErrors: result.fieldErrors ?? {},
        };
        setErrors(submissionErrors);
        requestedErrorsRef.current = submissionErrors;
        requestErrorFocus();
      } catch {
        setErrors({
          formErrors: [createMessageError(formMessages.submitFailed)],
          fieldErrors: {},
        });
      } finally {
        submissionInFlightRef.current = false;
        setSubmitting(false);
      }
    },
    [setSubmitting, validateForm, getFormValues, setErrors, requestErrorFocus],
  );

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  // Extract form-level errors from the unified error store
  const formErrors = getFormErrors();

  return {
    formProps: {
      onSubmit: handleSubmit,
    },
    reset: handleReset,
    formErrors,
  };
}
