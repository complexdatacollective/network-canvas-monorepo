import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import AppForm from '../AppForm';

// `FormWithoutProvider` hardcodes `onSubmitInvalid: focusFirstError`, which
// scrolls/focuses via the real DOM (fresco-ui's Form.tsx) — irrelevant to
// what these tests check (validate/onSubmit wiring), and jsdom implements no
// scrolling, so silence it rather than asserting real DOM focus.
vi.mock('@codaco/fresco-ui/form/utils/focusFirstError', () => ({
  focusFirstError: vi.fn(),
}));

describe('AppForm', () => {
  it('forwards id/className and submits the round trip with form values', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: true });

    const { container } = render(
      <AppForm id="basic-form" className="p-4" onSubmit={onSubmit}>
        <Field name="label" label="Label" component={InputField} />
        <button type="submit">Save</button>
      </AppForm>,
    );

    const form = container.querySelector('form');
    expect(form).toHaveAttribute('id', 'basic-form');
    expect(form).toHaveClass('p-4');
    expect(form).toHaveAttribute('novalidate');

    fireEvent.change(screen.getByRole('textbox', { name: 'Label' }), {
      target: { value: 'Alice' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'Alice' }),
      );
    });
  });

  it('treats a void onSubmit result as success', async () => {
    const onSubmit = vi.fn(() => undefined);

    render(
      <AppForm onSubmit={onSubmit}>
        <Field name="label" label="Label" component={InputField} />
        <button type="submit">Save</button>
      </AppForm>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('blocks submit on a form-level validate result and renders the field error', async () => {
    const onSubmit = vi.fn();
    const validate = vi.fn(() => ({ label: 'Required' }));

    render(
      <AppForm onSubmit={onSubmit} validate={validate}>
        <Field
          name="label"
          label="Label"
          component={InputField}
          initialValue=""
        />
        <button type="submit">Save</button>
      </AppForm>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('surfaces fieldErrors returned by an async onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      success: false,
      fieldErrors: { label: ['Server: name already taken'] },
    });

    render(
      <AppForm onSubmit={onSubmit}>
        <Field
          name="label"
          label="Label"
          component={InputField}
          initialValue="Alice"
        />
        <button type="submit">Save</button>
      </AppForm>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Server: name already taken'),
    ).toBeInTheDocument();
  });
});
