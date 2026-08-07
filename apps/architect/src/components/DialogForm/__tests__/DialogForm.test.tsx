import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import DialogForm from '../DialogForm';

// `FormWithoutProvider` hardcodes `onSubmitInvalid: focusFirstError`
// (fresco-ui's Form.tsx), so DialogForm relies on it rather than
// reimplementing scroll-to-first-invalid. Spy on it (without calling
// through) to prove the wiring reaches fresco-ui's default instead of
// asserting real DOM focus, which depends on Base UI's dialog focus-trap
// settling — not something this component controls or should be pinned to.
const focusFirstErrorSpy = vi.hoisted(() => vi.fn());

vi.mock('@codaco/fresco-ui/form/utils/focusFirstError', () => ({
  focusFirstError: focusFirstErrorSpy,
}));

describe('DialogForm', () => {
  it('renders Fields inside the form store provider, with the dialog title', () => {
    render(
      <DialogForm
        open
        onClose={vi.fn()}
        title="Edit Label"
        formId="render-form"
        submitLabel="Save"
        onSubmit={vi.fn()}
      >
        <Field
          name="label"
          label="Label"
          component={InputField}
          initialValue="Alice"
        />
      </DialogForm>,
    );

    expect(
      screen.getByRole('heading', { name: 'Edit Label' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Label' })).toHaveValue('Alice');
  });

  it('submits via the footer button’s form= association, not DOM nesting', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: true });

    render(
      <DialogForm
        open
        onClose={vi.fn()}
        formId="assoc-form"
        submitLabel="Save"
        onSubmit={onSubmit}
      >
        <Field name="label" label="Label" component={InputField} />
      </DialogForm>,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Label' }), {
      target: { value: 'Alice' },
    });

    const submitButton = screen.getByRole('button', { name: 'Save' });
    // The footer (and its SubmitButton) is rendered outside the <form>
    // element — association happens purely via the native `form=` attribute.
    expect(submitButton.closest('form')).toBeNull();
    expect(submitButton).toHaveAttribute('form', 'assoc-form');

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'Alice' }),
      );
    });
  });

  it('blocks submit on a form-level validate result, renders the field error, and invokes fresco-ui’s focusFirstError', async () => {
    const onSubmit = vi.fn();
    const validate = vi.fn(() => ({ label: 'Name already used' }));

    render(
      <DialogForm
        open
        onClose={vi.fn()}
        formId="validate-form"
        submitLabel="Save"
        onSubmit={onSubmit}
        validate={validate}
      >
        <Field
          name="label"
          label="Label"
          component={InputField}
          initialValue="Bob"
        />
      </DialogForm>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Name already used')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(focusFirstErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldErrors: { label: ['Name already used'] },
        }),
      );
    });
  });

  it('passes editIndex through to validate as context', async () => {
    const validate = vi.fn(() => undefined);

    render(
      <DialogForm
        open
        onClose={vi.fn()}
        formId="edit-index-form"
        submitLabel="Save"
        onSubmit={vi.fn().mockResolvedValue({ success: true })}
        validate={validate}
        editIndex={2}
      >
        <Field
          name="label"
          label="Label"
          component={InputField}
          initialValue="Alice"
        />
      </DialogForm>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(validate).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'Alice' }),
        { editIndex: 2 },
      );
    });
  });

  it('surfaces fieldErrors returned by an async onSubmit (e.g. onBeforeSave-style handlers)', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      success: false,
      fieldErrors: { label: ['Server: name already taken'] },
    });

    render(
      <DialogForm
        open
        onClose={vi.fn()}
        formId="async-error-form"
        submitLabel="Save"
        onSubmit={onSubmit}
      >
        <Field
          name="label"
          label="Label"
          component={InputField}
          initialValue="Alice"
        />
      </DialogForm>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Server: name already taken'),
    ).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Alice' }),
    );
  });

  it('treats a void onSubmit result as success', async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn(() => undefined);

    render(
      <DialogForm
        open
        onClose={onClose}
        formId="void-success-form"
        submitLabel="Save"
        onSubmit={onSubmit}
      >
        <Field name="label" label="Label" component={InputField} />
      </DialogForm>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    // A void return is treated as success: no field/form errors renders.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('disables Cancel and Submit and makes the dialog non-dismissible while submitting', async () => {
    let resolveSubmit: (value: { success: true }) => void = () => undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<{ success: true }>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    const onClose = vi.fn();

    render(
      <DialogForm
        open
        onClose={onClose}
        formId="busy-form"
        submitLabel="Save"
        onSubmit={onSubmit}
      >
        <Field
          name="label"
          label="Label"
          component={InputField}
          initialValue="Alice"
        />
      </DialogForm>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    // The submit control keeps its name while busy — it reports the busy
    // state instead — so "Save is gone" still means "the dialog closed".
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    // Non-dismissible: neither Escape nor the (disabled) Cancel button close it.
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    resolveSubmit({ success: true });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    });
  });
});
