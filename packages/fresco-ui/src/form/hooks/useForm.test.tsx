import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Field from '../Field/Field';
import InputField from '../fields/InputField';
import FormStoreProvider from '../store/formStoreProvider';
import { useForm } from './useForm';
import useFormStore from './useFormStore';

describe('useForm submission errors', () => {
  it('surfaces returned field errors and routes them through onSubmitInvalid', async () => {
    const serverErrors = {
      formErrors: [],
      fieldErrors: { username: ['Username is already taken'] },
    };
    const onSubmitInvalid = vi.fn();

    function Harness() {
      const { formProps } = useForm({
        onSubmit: async () => ({ success: false as const, ...serverErrors }),
        onSubmitInvalid,
      });

      return (
        <form onSubmit={formProps.onSubmit}>
          <Field
            name="username"
            label="Username"
            component={InputField}
            initialValue="existing"
          />
          <button type="submit">Submit</button>
        </form>
      );
    }

    render(
      <FormStoreProvider>
        <Harness />
      </FormStoreProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('Username is already taken')).toBeVisible();
    await waitFor(() => {
      expect(onSubmitInvalid).toHaveBeenCalledWith(serverErrors);
    });
  });

  it('restores validity after a server field error is followed by a successful submit', async () => {
    let resolveSuccessfulSubmit: (result: { success: true }) => void = () =>
      undefined;
    const successfulSubmit = new Promise<{ success: true }>((resolve) => {
      resolveSuccessfulSubmit = resolve;
    });
    const onSubmit = vi
      .fn()
      .mockResolvedValueOnce({
        success: false as const,
        formErrors: [],
        fieldErrors: { username: ['Username is already taken'] },
      })
      .mockReturnValueOnce(successfulSubmit);

    function ValidityProbe() {
      const isValid = useFormStore((state) => state.isValid);
      const isSubmitting = useFormStore((state) => state.isSubmitting);
      return (
        <>
          <output data-testid="form-validity">{String(isValid)}</output>
          <output data-testid="form-submitting">{String(isSubmitting)}</output>
        </>
      );
    }

    function Harness() {
      const { formProps } = useForm({ onSubmit });

      return (
        <form onSubmit={formProps.onSubmit}>
          <Field
            name="username"
            label="Username"
            component={InputField}
            initialValue="existing"
          />
          <ValidityProbe />
          <button type="submit">Submit</button>
        </form>
      );
    }

    render(
      <FormStoreProvider>
        <Harness />
      </FormStoreProvider>,
    );

    const submit = screen.getByRole('button', { name: 'Submit' });
    fireEvent.click(submit);
    expect(await screen.findByText('Username is already taken')).toBeVisible();
    expect(screen.getByTestId('form-validity')).toHaveTextContent('false');

    fireEvent.click(submit);
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('form-submitting')).toHaveTextContent('true');
    });

    act(() => resolveSuccessfulSubmit({ success: true }));
    await waitFor(() => {
      expect(screen.queryByText('Username is already taken')).toBeNull();
      expect(screen.getByTestId('form-submitting')).toHaveTextContent('false');
      expect(screen.getByTestId('form-validity')).toHaveTextContent('true');
    });
  });
});
