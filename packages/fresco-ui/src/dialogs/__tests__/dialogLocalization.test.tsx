import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { commonCatalogs, commonMessages } from '@codaco/app-i18n/common';
import { ecosystemLocales, mergeCatalogs } from '@codaco/app-i18n/locales';
import { AppI18nProvider, AppMessage } from '@codaco/app-i18n/react';

import { frescoUiCatalogs } from '../../locales/catalogs';
import DialogProvider from '../DialogProvider';
import useDialog from '../useDialog';

function Trigger({ fail }: { fail: () => never }) {
  const { confirm } = useDialog();
  return (
    <button
      onClick={() =>
        void confirm({
          confirmLabel: <AppMessage message={commonMessages.delete} />,
          onConfirm: fail,
          describeError: () => (
            <AppMessage message={commonMessages.genericError} />
          ),
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
