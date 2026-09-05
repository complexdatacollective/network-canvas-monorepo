import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ArchitectI18nRoot } from '../ArchitectI18nRoot';
import * as preference from '../preference';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-MX']);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('keeps recovery and retry reachable when locale provider initialization throws', async () => {
  document.documentElement.lang = 'es';
  document.documentElement.dir = 'ltr';
  let unavailable = true;
  vi.spyOn(preference, 'readLocalePreference').mockImplementation(() => {
    if (unavailable) throw new Error('Locale initialization failed');
    return null;
  });
  render(
    <ArchitectI18nRoot>
      <h1>Research workspace</h1>
    </ArchitectI18nRoot>,
  );
  expect(
    await screen.findByRole('heading', { name: 'Something went wrong.' }),
  ).toBeVisible();
  expect(screen.getByText('Technical details (English)')).toBeVisible();
  expect(screen.getByText(/Locale initialization failed/)).toBeVisible();
  expect(document.documentElement).toHaveAttribute('lang', 'en');
  expect(document.documentElement).toHaveAttribute('dir', 'ltr');
  unavailable = false;
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  expect(
    await screen.findByRole('heading', { name: 'Research workspace' }),
  ).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(document.documentElement).toHaveAttribute('lang', 'es');
});

it('retains localized inner recovery for ordinary application failures', async () => {
  let unavailable = true;
  function Workspace() {
    if (unavailable) throw new Error('Research view unavailable');
    return <h1>Research workspace</h1>;
  }
  render(
    <ArchitectI18nRoot>
      <Workspace />
    </ArchitectI18nRoot>,
  );
  expect(
    await screen.findByRole('heading', { name: 'Se ha producido un error.' }),
  ).toBeVisible();
  expect(screen.getByText('Detalles técnicos (en inglés)')).toBeVisible();
  expect(
    screen.getByText(/Research view unavailable/).closest('pre'),
  ).toHaveAttribute('lang', 'en');
  act(() => {
    localStorage.setItem(preference.ARCHITECT_LOCALE_KEY, 'en-GB');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: preference.ARCHITECT_LOCALE_KEY,
        newValue: 'en-GB',
      }),
    );
  });
  expect(
    await screen.findByRole('heading', { name: 'Something went wrong.' }),
  ).toBeVisible();
  expect(document.documentElement).toHaveAttribute('lang', 'en-GB');
  unavailable = false;
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  expect(
    await screen.findByRole('heading', { name: 'Research workspace' }),
  ).toBeVisible();
  expect(document.documentElement).toHaveAttribute('lang', 'en-GB');
});
