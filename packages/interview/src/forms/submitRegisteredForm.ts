import type { ContextType } from 'react';

import { type FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FlattenedErrors } from '@codaco/fresco-ui/form/store/types';

type FormStoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

const genericSubmissionErrors: FlattenedErrors = {
  formErrors: ['An error occurred while submitting the form.'],
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

export async function submitRegisteredForm(
  storeApi: FormStoreApi,
): Promise<boolean> {
  const state = storeApi.getState();
  const submitHandler = state.submitHandler;

  if (!submitHandler) {
    surfaceSubmissionErrors(storeApi, genericSubmissionErrors);
    return false;
  }

  try {
    const result = await submitHandler(state.getFormValues());

    if (result.success) {
      state.setErrors(null);
      return true;
    }

    surfaceSubmissionErrors(storeApi, {
      formErrors: result.formErrors ?? [],
      fieldErrors: result.fieldErrors ?? {},
    });
    return false;
  } catch {
    surfaceSubmissionErrors(storeApi, genericSubmissionErrors);
    return false;
  }
}
