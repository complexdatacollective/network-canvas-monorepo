import { act, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ecosystemLocales, mergeCatalogs } from '@codaco/app-i18n/locales';
import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { AppI18nProvider, useAppIntl } from '@codaco/app-i18n/react';

import { frescoUiCatalogs } from '../locales/catalogs';
import Field from './Field/Field';
import InputField from './fields/InputField';
import Form from './Form';
import SubmitButton from './SubmitButton';

const messages = defineMessages({
  taken: {
    id: 'test.form.taken',
    defaultMessage: 'This name is already in use.',
    description:
      'Test server refusal for a name that passes client validation.',
  },
  failed: {
    id: 'test.form.failed',
    defaultMessage: 'Your account could not be saved.',
    description: 'Test whole-form submission failure.',
  },
  hint: {
    id: 'test.form.hint',
    defaultMessage: 'Enter your name.',
    description: 'Test localized custom validation hint.',
  },
  reserved: {
    id: 'test.form.reserved',
    defaultMessage: 'Choose a different name.',
    description:
      'Test custom client validation with a locale-dependent schema.',
  },
});
const spanish = {
  'test.form.taken': 'Este nombre ya está en uso.',
  'test.form.failed': 'No se pudo guardar tu cuenta.',
  'test.form.hint': 'Introduce tu nombre.',
  'test.form.reserved': 'Elige otro nombre.',
};

function NameField() {
  const intl = useAppIntl();
  return (
    <Field
      name="name"
      label="Name"
      component={InputField}
      required
      custom={{
        hint: intl.formatMessage(messages.hint),
        schema: z.string().refine((value) => value !== 'reserved', {
          error: intl.formatMessage(messages.reserved),
        }),
      }}
    />
  );
}

it('reformats submitted field/form errors while preserving their refusal, values and focus', async () => {
  const submit = vi.fn(() => ({
    success: false as const,
    fieldErrors: { name: [createMessageError(messages.taken)] },
    formErrors: [createMessageError(messages.failed)],
  }));
  const view = (locale: string) => (
    <AppI18nProvider
      locale={locale}
      locales={ecosystemLocales}
      manageDocument={false}
      messages={mergeCatalogs(
        frescoUiCatalogs[locale] ?? {},
        locale === 'es' ? spanish : {},
      )}
    >
      <Form onSubmit={submit}>
        <NameField />
        <SubmitButton>Save</SubmitButton>
      </Form>
    </AppI18nProvider>
  );
  const { container, rerender } = render(view('en'));
  const screen = within(container);
  const user = userEvent.setup();
  const input = screen.getByRole('textbox', { name: 'Name' });
  await user.type(input, '<Ana>');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(
    await screen.findByText('This name is already in use.'),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Your account could not be saved.'),
  ).toBeInTheDocument();
  expect(input).toHaveFocus();
  await act(async () => rerender(view('es')));
  expect(
    await screen.findByText('Este nombre ya está en uso.'),
  ).toBeInTheDocument();
  expect(screen.getByText('No se pudo guardar tu cuenta.')).toBeInTheDocument();
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveValue('<Ana>');
  expect(input).toHaveFocus();
  expect(submit).toHaveBeenCalledTimes(1);
  await user.clear(input);
  await user.type(input, 'reserved');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Elige otro nombre.')).toBeInTheDocument();
  expect(submit).toHaveBeenCalledTimes(1);
});

it('reformats the shared submit-throw fallback after the operation has failed', async () => {
  const submit = vi.fn((): never => {
    throw new Error('private diagnostic');
  });
  const view = (locale: string) => (
    <AppI18nProvider
      locale={locale}
      locales={ecosystemLocales}
      manageDocument={false}
      messages={frescoUiCatalogs[locale]}
    >
      <Form onSubmit={submit}>
        <SubmitButton>Submit</SubmitButton>
      </Form>
    </AppI18nProvider>
  );
  const { container, rerender } = render(view('en'));
  const screen = within(container);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Submit' }));
  expect(
    await screen.findByText('An error occurred while submitting the form.'),
  ).toBeInTheDocument();
  await act(async () => rerender(view('es')));
  expect(
    screen.getByText('Se ha producido un error al enviar el formulario.'),
  ).toBeInTheDocument();
  expect(submit).toHaveBeenCalledTimes(1);
});
