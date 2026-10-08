import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Field from '../Field/Field';
import FieldNamespace from '../FieldNamespace';
import InputField from '../fields/InputField';
import FormStoreProvider from '../store/formStoreProvider';
import type { FormSubmissionResult, FormSubmitHandler } from '../store/types';
import { focusFirstError } from '../utils/focusFirstError';
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

  it('surfaces a server error keyed by an opaque dotted field identifier', async () => {
    const onSubmitInvalid = vi.fn();

    function Harness() {
      const { formProps } = useForm({
        onSubmit: async () => ({
          success: false as const,
          formErrors: [],
          fieldErrors: {
            'favorite.color': ['Choose another color'],
          },
        }),
        onSubmitInvalid,
      });

      return (
        <form onSubmit={formProps.onSubmit}>
          <Field
            name="favorite.color"
            nameMode="opaque"
            label="Favorite color"
            component={InputField}
            initialValue="blue"
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

    expect(await screen.findByText('Choose another color')).toBeVisible();
    expect(
      screen.getByRole('textbox', { name: 'Favorite color' }),
    ).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen
        .getByRole('textbox', { name: 'Favorite color' })
        .closest('[data-field-name]'),
    ).toHaveAttribute('data-field-name', 'favorite.color');
    expect(
      screen
        .getByRole('textbox', { name: 'Favorite color' })
        .closest('[data-field-path]'),
    ).toHaveAttribute('data-field-path', '["favorite.color"]');
    await waitFor(() => {
      expect(onSubmitInvalid).toHaveBeenCalledWith({
        formErrors: [],
        fieldErrors: {
          'favorite.color': ['Choose another color'],
        },
      });
    });
  });

  it('maps a noncanonical legacy field error to its internal path', async () => {
    const onSubmitInvalid = vi.fn();

    function Harness() {
      const { formProps } = useForm({
        onSubmit: async () => ({
          success: false as const,
          formErrors: [],
          fieldErrors: {
            'weight[kg]': ['Enter a supported weight'],
          },
        }),
        onSubmitInvalid,
      });

      return (
        <form onSubmit={formProps.onSubmit}>
          <Field
            name="weight[kg]"
            label="Weight"
            component={InputField}
            initialValue="10"
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

    expect(await screen.findByText('Enter a supported weight')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Weight' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await waitFor(() => {
      expect(onSubmitInvalid).toHaveBeenCalledWith({
        formErrors: [],
        fieldErrors: {
          'weight[kg]': ['Enter a supported weight'],
        },
      });
    });
  });

  it('maps a namespaced public opaque field error to its internal path', async () => {
    const onSubmitInvalid = vi.fn();

    function Harness() {
      const { formProps } = useForm({
        onSubmit: async () => ({
          success: false as const,
          formErrors: [],
          fieldErrors: {
            'person.favorite.color': ['Choose another color'],
          },
        }),
        onSubmitInvalid,
      });

      return (
        <form onSubmit={formProps.onSubmit}>
          <FieldNamespace prefix="person">
            <Field
              name="favorite.color"
              nameMode="opaque"
              label="Favorite color"
              component={InputField}
              initialValue="blue"
            />
          </FieldNamespace>
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

    expect(await screen.findByText('Choose another color')).toBeVisible();
    await waitFor(() => {
      expect(onSubmitInvalid).toHaveBeenCalledWith({
        formErrors: [],
        fieldErrors: {
          'person.favorite.color': ['Choose another color'],
        },
      });
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

/**
 * Issue #1385: an invalid submission left focus on `document.body` for the
 * length of a timer, and dropped it entirely whenever React's own commit-time
 * focus restoration won the race. Focus is now taken from a layout effect on
 * the commit that renders the errors, so it is deterministic.
 */
describe('useForm invalid-submit focus', () => {
  it('focuses the first invalid control, in document order, with nothing deferred', async () => {
    function Harness() {
      const { formProps } = useForm({
        onSubmit: async () => ({ success: true as const }),
        onSubmitInvalid: focusFirstError,
      });

      return (
        <form onSubmit={formProps.onSubmit}>
          <Field name="first" label="First" component={InputField} required />
          <Field name="second" label="Second" component={InputField} required />
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

    // No fake timers, no waitFor on focus: the error render and the focus land
    // in the same commit, so focus is already correct the moment the error is.
    expect(
      await screen.findAllByText(/must answer this question/),
    ).toHaveLength(2);
    expect(
      document.activeElement?.closest('[data-field-name="first"]'),
    ).not.toBeNull();
  });
});

/**
 * A submit that arrived while an earlier one was still running validated and
 * called `onSubmit` again, so an async save stored the same thing twice.
 * `SubmitButton` and fields disable themselves while submitting, but nothing
 * else did: `requestSubmit()`, a submit control that is not `SubmitButton`, or
 * Enter in an input that is not a `Field` all reached the handler again.
 */
describe('useForm while a submission is in flight', () => {
  function deferredSubmit() {
    const pending: {
      resolve: (result: FormSubmissionResult) => void;
      reject: (error: Error) => void;
    }[] = [];
    const onSubmit = vi.fn(
      () =>
        new Promise<FormSubmissionResult>((resolve, reject) => {
          pending.push({ resolve, reject });
        }),
    );
    return {
      onSubmit,
      resolveNext: (result: FormSubmissionResult) =>
        act(async () => {
          pending.shift()?.resolve(result);
        }),
      rejectNext: () =>
        act(async () => {
          pending.shift()?.reject(new Error('Save failed'));
        }),
    };
  }

  function Harness({
    onSubmit,
    required = false,
  }: {
    onSubmit: FormSubmitHandler;
    required?: boolean;
  }) {
    const { formProps } = useForm({ onSubmit });
    const isSubmitting = useFormStore((state) => state.isSubmitting);

    return (
      <>
        <form
          id="guarded-form"
          aria-label="Guarded"
          noValidate
          onSubmit={formProps.onSubmit}
        >
          <Field
            name="name"
            label="Name"
            component={InputField}
            required={required}
            initialValue={required ? undefined : 'Ada'}
          />
        </form>
        {/* Not a SubmitButton, so nothing disables it while submitting. */}
        <button type="submit" form="guarded-form">
          Save from outside
        </button>
        <output data-testid="submitting">{String(isSubmitting)}</output>
      </>
    );
  }

  function renderHarness(props: Parameters<typeof Harness>[0]) {
    render(
      <FormStoreProvider>
        <Harness {...props} />
      </FormStoreProvider>,
    );
    return {
      form: screen.getByRole<HTMLFormElement>('form', { name: 'Guarded' }),
      outsideButton: screen.getByRole('button', { name: 'Save from outside' }),
    };
  }

  // A macrotask lets every pending microtask run, so a submission the guard
  // let through has finished validating and reached `onSubmit` by now.
  const drainMicrotasks = () =>
    act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

  const waitForSubmissionToFinish = () =>
    waitFor(() => {
      expect(screen.getByTestId('submitting')).toHaveTextContent('false');
    });

  it('calls onSubmit once for submits that arrive while it is still running', async () => {
    const { onSubmit, resolveNext } = deferredSubmit();
    const { form, outsideButton } = renderHarness({ onSubmit });

    // Two in quick succession: the second lands while the first validates.
    act(() => form.requestSubmit());
    fireEvent.click(outsideButton);
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    // More while onSubmit itself is pending. An ignored submit is still
    // cancelled, so a native form never falls through to navigating.
    act(() => form.requestSubmit());
    fireEvent.click(outsideButton);
    expect(fireEvent.submit(form)).toBe(false);
    await drainMicrotasks();
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await resolveNext({ success: true });
    await waitForSubmissionToFinish();
    await drainMicrotasks();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('accepts a new submit once the submission has finished', async () => {
    const { onSubmit, resolveNext } = deferredSubmit();
    const { form, outsideButton } = renderHarness({ onSubmit });

    act(() => form.requestSubmit());
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    await resolveNext({ success: true });
    await waitForSubmissionToFinish();

    fireEvent.click(outsideButton);
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(2);
    });
  });

  it.each([
    {
      outcome: 'returns errors',
      finish: (submit: ReturnType<typeof deferredSubmit>) =>
        submit.resolveNext({
          success: false,
          formErrors: [],
          fieldErrors: { name: ['Name is already taken'] },
        }),
    },
    {
      outcome: 'throws',
      finish: (submit: ReturnType<typeof deferredSubmit>) =>
        submit.rejectNext(),
    },
  ])('accepts a new submit after onSubmit $outcome', async ({ finish }) => {
    const submit = deferredSubmit();
    const { form } = renderHarness({ onSubmit: submit.onSubmit });

    act(() => form.requestSubmit());
    await waitFor(() => {
      expect(submit.onSubmit).toHaveBeenCalledTimes(1);
    });
    await finish(submit);
    await waitForSubmissionToFinish();

    act(() => form.requestSubmit());
    await waitFor(() => {
      expect(submit.onSubmit).toHaveBeenCalledTimes(2);
    });
  });

  it('accepts a new submit after client validation rejects one', async () => {
    const { onSubmit } = deferredSubmit();
    const { form } = renderHarness({ onSubmit, required: true });

    act(() => form.requestSubmit());
    expect(
      await screen.findByText(/must answer this question/),
    ).toBeInTheDocument();
    await waitForSubmissionToFinish();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Ada' },
    });
    act(() => form.requestSubmit());
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });
});
