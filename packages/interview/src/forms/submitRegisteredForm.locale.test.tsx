import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ContextType, useContext, useEffect } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

import { InterviewI18nProvider } from '../i18n/InterviewI18nProvider';
import { submitRegisteredForm } from './submitRegisteredForm';

type FormStoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

// jsdom has no viewport observation. Motion's Alert still creates an observer
// even with reduced motion; the error content and real form remain mounted.
beforeAll(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

describe('registered form failure language', () => {
  it('updates a retained submission failure without discarding its value or preventing retry', async () => {
    let captured: FormStoreApi | undefined;
    function Capture() {
      const store = useContext(FormStoreContext);
      useEffect(() => {
        if (store) captured = store;
      }, [store]);
      return (
        <Field
          name="answer"
          label="Literal study label"
          component={InputField}
        />
      );
    }
    const form = (
      <Form
        onSubmit={() => {
          throw new Error('Unavailable handler');
        }}
      >
        <Capture />
      </Form>
    );
    const view = render(
      <InterviewI18nProvider requestedLocale="es">
        {form}
      </InterviewI18nProvider>,
    );
    await waitFor(() => expect(captured).toBeDefined());
    if (!captured) throw new Error('The real form did not expose its store');
    const store = captured;
    const input = screen.getByRole('textbox', { name: 'Literal study label' });
    await userEvent.setup().type(input, 'Málaga & <respuesta>');
    await act(async () => {
      expect(await submitRegisteredForm(store)).toBe(false);
    });
    expect(
      screen.getByText('Se produjo un error al enviar el formulario.'),
    ).toBeVisible();
    const errors = store.getState().errors;
    view.rerender(
      <InterviewI18nProvider requestedLocale="en-GB">
        {form}
      </InterviewI18nProvider>,
    );
    expect(
      screen.getByText('An error occurred while submitting the form.'),
    ).toBeVisible();
    expect(store.getState().errors).toBe(errors);
    expect(screen.getByRole('textbox', { name: 'Literal study label' })).toBe(
      input,
    );
    expect(input).toHaveValue('Málaga & <respuesta>');
    store.getState().registerForm({ onSubmit: () => ({ success: true }) });
    await act(async () => {
      expect(await submitRegisteredForm(store)).toBe(true);
    });
    expect(store.getState().getFormValues()).toEqual({
      answer: 'Málaga & <respuesta>',
    });
    expect(store.getState().errors).toEqual({
      formErrors: [],
      fieldErrors: {},
    });
  });
});
