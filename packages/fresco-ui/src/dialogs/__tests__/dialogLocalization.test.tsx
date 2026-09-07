import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { commonCatalogs, commonMessages } from '@codaco/app-i18n/common';
import { ecosystemLocales, mergeCatalogs } from '@codaco/app-i18n/locales';
import { createMessageError } from '@codaco/app-i18n/messages';
import { AppI18nProvider, AppMessage } from '@codaco/app-i18n/react';

import { frescoUiCatalogs } from '../../locales/catalogs';
import DialogProvider from '../DialogProvider';
import useDialog from '../useDialog';

function Trigger({
  fail,
  describeError = true,
}: {
  fail: () => void | Promise<void>;
  describeError?: boolean;
}) {
  const { confirm } = useDialog();
  return (
    <button
      onClick={() =>
        void confirm({
          confirmLabel: <AppMessage message={commonMessages.delete} />,
          onConfirm: fail,
          describeError: describeError
            ? () => <AppMessage message={commonMessages.genericError} />
            : undefined,
        })
      }
    >
      Open
    </button>
  );
}

it('keeps queued dialog defaults, actions and a rejected action live across locale changes', async () => {
  const fail = vi.fn((): never => {
    throw new Error('technical storage failure');
  });
  const view = (locale: string) => (
    <AppI18nProvider
      locale={locale}
      locales={ecosystemLocales}
      messages={mergeCatalogs(
        commonCatalogs[locale] ?? {},
        frescoUiCatalogs[locale] ?? {},
      )}
    >
      <DialogProvider>
        <Trigger fail={fail} />
      </DialogProvider>
    </AppI18nProvider>
  );
  const { rerender } = render(view('en'));
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Open' }));
  const dialog = await screen.findByRole('dialog', { name: 'Are you sure?' });
  await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
  expect(fail).toHaveBeenCalledTimes(1);
  expect(within(dialog).getByText('Something went wrong.')).toBeInTheDocument();
  rerender(view('es'));
  const localized = screen.getByRole('dialog', { name: '¿Quieres continuar?' });
  expect(
    within(localized).getByRole('button', { name: 'Eliminar' }),
  ).toBeEnabled();
  expect(
    within(localized).getByRole('button', { name: 'Cancelar' }),
  ).toBeEnabled();
  expect(
    within(localized).getByText('Se ha producido un error.'),
  ).toBeInTheDocument();
  expect(
    within(localized).getByText('Esta acción no se puede deshacer.'),
  ).toBeInTheDocument();
});

it.each(['sync', 'async'] as const)(
  'reformats an encoded %s refusal without rerunning the action and permits retry',
  async (mode) => {
    const refuse = () => {
      const error = new Error(createMessageError(commonMessages.genericError));
      if (mode === 'async') return Promise.reject(error);
      throw error;
    };
    const fail = vi
      .fn<() => void | Promise<void>>()
      .mockImplementationOnce(refuse);
    const view = (locale: string) => (
      <AppI18nProvider
        locale={locale}
        locales={ecosystemLocales}
        messages={mergeCatalogs(
          commonCatalogs[locale] ?? {},
          frescoUiCatalogs[locale] ?? {},
        )}
      >
        <DialogProvider>
          <Trigger fail={fail} describeError={false} />
        </DialogProvider>
      </AppI18nProvider>
    );
    const { rerender } = render(view('en'));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('dialog', { name: 'Are you sure?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(
      await within(dialog).findByText('Something went wrong.'),
    ).toBeInTheDocument();
    rerender(view('es'));
    const translated = screen.getByRole('dialog', {
      name: '¿Quieres continuar?',
    });
    expect(
      within(translated).getByText('Se ha producido un error.'),
    ).toBeInTheDocument();
    expect(fail).toHaveBeenCalledTimes(1);
    await user.click(
      within(translated).getByRole('button', { name: 'Eliminar' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(fail).toHaveBeenCalledTimes(2);
  },
);
