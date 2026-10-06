import { Toast } from '@base-ui/react/toast';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { commonCatalogLoaders } from '@codaco/app-i18n/common';
import {
  createCatalogSource,
  ecosystemLocales,
} from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';

import LocaleLoadFailureToast from './LocaleLoadFailureToast';
import { frescoUiCatalogLoaders } from './locales/catalogs';
import { Toaster } from './Toast';

const catalogs = createCatalogSource(
  commonCatalogLoaders,
  frescoUiCatalogLoaders,
);
await catalogs.load('de');

const offline = new Error('offline');

function view({
  shown = 'en',
  failed,
  onReload,
  onFailure,
}: {
  shown?: string;
  failed?: string;
  onReload?: () => void;
  onFailure?: (error: unknown, locale: string) => void;
}) {
  return (
    <AppI18nProvider
      locale={shown}
      locales={ecosystemLocales}
      messages={catalogs.peek(shown)}
      loadFailure={
        failed === undefined ? undefined : { locale: failed, error: offline }
      }
    >
      <Toast.Provider>
        <LocaleLoadFailureToast onReload={onReload} onFailure={onFailure} />
        <Toaster />
      </Toast.Provider>
    </AppI18nProvider>
  );
}

it('names the language it could not load and the one shown instead, and offers a reload', async () => {
  const onReload = vi.fn();
  const onFailure = vi.fn();
  const { rerender } = render(view({ failed: 'es', onReload, onFailure }));

  expect(
    screen.getByRole('heading', { name: 'Couldn’t load Español' }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      'Showing English instead. Check your connection, then reload to try again.',
    ),
  ).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Reload' }));
  expect(onReload).toHaveBeenCalledOnce();

  rerender(view({ failed: 'es', onReload, onFailure }));
  expect(screen.getAllByRole('heading')).toHaveLength(1);
  expect(onFailure).toHaveBeenCalledOnce();
  expect(onFailure).toHaveBeenCalledWith(offline, 'es');
});

it('offers no reload where the host gives none', () => {
  render(view({ failed: 'es' }));
  expect(screen.getByText('Showing English instead.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
});

it('speaks the language on screen', () => {
  render(view({ shown: 'de', failed: 'es', onReload: () => {} }));
  expect(
    screen.getByRole('heading', {
      name: 'Español konnte nicht geladen werden',
    }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Neu laden' })).toBeInTheDocument();
});

it('goes away once the language arrives', async () => {
  const { rerender } = render(view({ failed: 'es' }));
  expect(screen.getByRole('heading')).toBeInTheDocument();

  rerender(view({ shown: 'es' }));
  await waitFor(() => expect(screen.queryByRole('heading')).toBeNull());
});
