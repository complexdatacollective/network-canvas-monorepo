import { Toast } from '@base-ui/react/toast';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';

import { commonMessages, commonCatalogs } from '@codaco/app-i18n/common';
import { ecosystemLocales, mergeCatalogs } from '@codaco/app-i18n/locales';
import { AppI18nProvider, useAppIntl } from '@codaco/app-i18n/react';

import { frescoUiCatalogs } from './locales/catalogs';
import { Toaster, useToast } from './Toast';

function LiveTitle() {
  const intl = useAppIntl();
  return intl.formatMessage(commonMessages.loading);
}

function Trigger() {
  const { add } = useToast();
  return (
    <button onClick={() => add({ title: <LiveTitle />, timeout: 0 })}>
      Show
    </button>
  );
}

it('updates the notification region and an existing rich title when the locale changes', async () => {
  const view = (locale: string) => (
    <AppI18nProvider
      locale={locale}
      locales={ecosystemLocales}
      messages={mergeCatalogs(commonCatalogs[locale], frescoUiCatalogs[locale])}
    >
      <Toast.Provider>
        <Trigger />
        <Toaster />
      </Toast.Provider>
    </AppI18nProvider>
  );
  const { rerender } = render(view('en'));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Show' }));
  expect(
    screen.getByRole('region', { name: 'Notifications' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Loading…' })).toBeInTheDocument();
  rerender(view('es'));
  expect(
    screen.getByRole('region', { name: 'Notificaciones' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Cargando…' }),
  ).toBeInTheDocument();
  expect(
    screen.getByLabelText('Cerrar', { selector: 'button' }),
  ).toBeInTheDocument();
});
