import { render, waitFor } from '@testing-library/react';
import { type ContextType, useContext, useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider, {
  FormStoreContext,
} from '@codaco/fresco-ui/form/store/formStoreProvider';

import { submitRegisteredForm } from './submitRegisteredForm';

type FormStoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

const captureFormStore = async () => {
  let capturedStore: FormStoreApi | undefined;

  function CaptureStore() {
    const storeApi = useContext(FormStoreContext);

    useEffect(() => {
      capturedStore = storeApi;
    }, [storeApi]);

    return null;
  }

  render(
    <FormStoreProvider>
      <CaptureStore />
    </FormStoreProvider>,
  );

  await waitFor(() => {
    expect(capturedStore).toBeDefined();
  });

  if (!capturedStore) {
    throw new Error('Form store was not provided');
  }

  return capturedStore;
};

describe('submitRegisteredForm', () => {
  it('uses the submit handler result instead of the current validation flag', async () => {
    const storeApi = await captureFormStore();
    storeApi.getState().setErrors({
      formErrors: ['Stale error'],
      fieldErrors: {},
    });
    storeApi.getState().registerForm({
      onSubmit: async () => ({ success: true }),
    });

    await expect(submitRegisteredForm(storeApi)).resolves.toBe(true);
    expect(storeApi.getState().errors).toEqual({
      formErrors: [],
      fieldErrors: {},
    });
  });

  it('blocks submission failures and routes their errors through the invalid handler', async () => {
    const storeApi = await captureFormStore();
    const onSubmitInvalid = vi.fn();
    const submissionErrors = {
      formErrors: ['Unable to save this form.'],
      fieldErrors: {},
    };
    storeApi.getState().registerForm({
      onSubmit: async () => ({ success: false, ...submissionErrors }),
      onSubmitInvalid,
    });

    await expect(submitRegisteredForm(storeApi)).resolves.toBe(false);
    expect(storeApi.getState().errors).toEqual(submissionErrors);
    await waitFor(() => {
      expect(onSubmitInvalid).toHaveBeenCalledWith(submissionErrors);
    });
  });
});
