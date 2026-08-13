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
  storeApi.getState().setErrors(errors);
  setTimeout(() => {
    storeApi.getState().submitInvalidHandler?.(errors);
  }, 0);
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
