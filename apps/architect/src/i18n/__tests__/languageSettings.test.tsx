import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { PSEUDO_LOCALE } from '@codaco/app-i18n/locales';

import { ArchitectI18nProvider } from '../ArchitectI18nProvider';
import LanguageSettings from '../LanguageSettings';
import { ARCHITECT_LOCALE_KEY } from '../preference';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const openSettings = () => {
  render(
    <ArchitectI18nProvider>
      <LanguageSettings />
    </ArchitectI18nProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Language settings' }));
  return screen.getByRole('combobox', { name: 'Architect language' });
};

it('clears local save feedback when another tab supplies a neutral preference update', () => {
  const select = openSettings();
  fireEvent.change(select, { target: { value: 'en-GB' } });
  expect(screen.getByRole('status')).toHaveTextContent(
    'Language saved on this device.',
  );
  act(() => {
    localStorage.setItem(ARCHITECT_LOCALE_KEY, 'es');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: ARCHITECT_LOCALE_KEY,
        newValue: 'es',
      }),
    );
  });
  expect(
    screen.getByRole('dialog', { name: 'Ajustes de idioma' }),
  ).toBeVisible();
  expect(select).toHaveValue('es');
  expect(document.documentElement).toHaveAttribute('lang', 'es');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(localStorage.getItem(ARCHITECT_LOCALE_KEY)).toBe('es');
});

it('does not announce a persistence failure for the intentionally unsaved development locale', () => {
  const select = openSettings();
  fireEvent.change(select, { target: { value: PSEUDO_LOCALE } });
  expect(select).toHaveValue(PSEUDO_LOCALE);
  expect(document.documentElement).toHaveAttribute('lang', PSEUDO_LOCALE);
  expect(localStorage.getItem(ARCHITECT_LOCALE_KEY)).toBeNull();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('still announces a genuine write failure while applying the selected language', () => {
  const select = openSettings();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('blocked', 'SecurityError');
  });
  fireEvent.change(select, { target: { value: 'en-GB' } });
  expect(screen.getByRole('status')).toHaveTextContent(
    'Architect is using this language, but could not save the preference on this device. Choose it again on your next visit.',
  );
  expect(select).toHaveValue('en-GB');
  expect(document.documentElement).toHaveAttribute('lang', 'en-GB');
  expect(localStorage.getItem(ARCHITECT_LOCALE_KEY)).toBeNull();
});
