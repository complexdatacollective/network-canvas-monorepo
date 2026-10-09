import type { ContextType } from 'react';

import { createMessageError } from '@codaco/app-i18n/messages';
import { formMessages } from '@codaco/fresco-ui/form/hooks/useForm';
import { type FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type {
  FlattenedErrors,
  FormSubmissionResult,
} from '@codaco/fresco-ui/form/store/types';

type FormStoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

const genericSubmissionErrors: FlattenedErrors = {
  formErrors: [createMessageError(formMessages.submitFailed)],
  fieldErrors: {},
};

const surfaceSubmissionErrors = (
  storeApi: FormStoreApi,
  errors: FlattenedErrors,
) => {
  const state = storeApi.getState();
  state.setErrors(errors);
  // Hand off to the form's own error-focus request rather than scheduling a
  // timer here. The form runs its invalid-submit handler from a layout effect
  // on the commit that renders these errors, so focus is ordered against that
  // commit instead of racing it — the same guarantee every other submit path
  // now has.
  state.requestErrorFocus();
};

/**
 * Submits the form registered in `storeApi` as its own submit would.
 *
 * With `showSubmitting`, the form is marked as submitting while its handler
 * runs, as its own submit marks it, and unmarked before any error is shown:
 * the fields are disabled while it is submitting, and the request to focus
 * the first error would otherwise find them disabled and skip them.
 */
export async function submitRegisteredForm(
  storeApi: FormStoreApi,
  { showSubmitting = false }: { showSubmitting?: boolean } = {},
): Promise<boolean> {
  const state = storeApi.getState();
  const submitHandler = state.submitHandler;

  if (!submitHandler) {
    surfaceSubmissionErrors(storeApi, genericSubmissionErrors);
    return false;
  }

  let result: FormSubmissionResult | undefined;
  if (showSubmitting) state.setSubmitting(true);
  try {
    result = await submitHandler(state.getFormValues());
  } catch {
    result = undefined;
  } finally {
    if (showSubmitting) state.setSubmitting(false);
  }

  if (!result) {
    surfaceSubmissionErrors(storeApi, genericSubmissionErrors);
    return false;
  }

  if (result.success) {
    state.setErrors(null);
    return true;
  }

  surfaceSubmissionErrors(storeApi, {
    formErrors: result.formErrors ?? [],
    fieldErrors: result.fieldErrors ?? {},
  });
  return false;
}
