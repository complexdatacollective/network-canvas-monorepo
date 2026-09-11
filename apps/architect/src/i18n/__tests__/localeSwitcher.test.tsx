import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { PSEUDO_LOCALE } from '@codaco/app-i18n/locales';

import { ArchitectI18nProvider } from '../ArchitectI18nProvider';
import ArchitectLocaleSwitcher from '../ArchitectLocaleSwitcher';
import { ARCHITECT_LOCALE_KEY } from '../preference';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// The only combobox on the page; its accessible name follows the language.
const trigger = () => screen.getByRole('combobox');

const open = async () => {
  fireEvent.click(trigger());
  return screen.findByRole('dialog', {
    name: /^(Interface language|Idioma de la interfaz)$/,
  });
};

const renderAndOpen = async () => {
  render(
    <ArchitectI18nProvider>
      <ArchitectLocaleSwitcher />
    </ArchitectI18nProvider>,
  );
  return open();
};

const choose = async (name: RegExp) => {
  const popup = screen.getByRole('dialog');
  fireEvent.click(screen.getByRole('option', { name }));
  await waitFor(() => expect(popup).not.toBeInTheDocument());
};

it('applies a choice, stores it, and follows another tab’s change', async () => {
  await renderAndOpen();
  await choose(/^English \(UK\)/);
  expect(trigger()).toHaveTextContent('EN-GB');
  expect(document.documentElement).toHaveAttribute('lang', 'en-GB');
  expect(localStorage.getItem(ARCHITECT_LOCALE_KEY)).toBe('en-GB');
  act(() => {
    localStorage.setItem(ARCHITECT_LOCALE_KEY, 'es');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: ARCHITECT_LOCALE_KEY,
        newValue: 'es',
      }),
    );
  });
  expect(trigger()).toHaveTextContent('ES');
  expect(trigger()).toHaveAccessibleName('Idioma de la interfaz: Español');
  expect(document.documentElement).toHaveAttribute('lang', 'es');
});

it('never persists the development locale', async () => {
  await renderAndOpen();
  await choose(/^Þséûðö Éñglîsh/);
  expect(trigger()).toHaveTextContent('EN-XA');
  expect(document.documentElement).toHaveAttribute('lang', PSEUDO_LOCALE);
  expect(localStorage.getItem(ARCHITECT_LOCALE_KEY)).toBeNull();
});

it('still applies the selected language when storage refuses the write', async () => {
  await renderAndOpen();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('blocked', 'SecurityError');
  });
  await choose(/^English \(UK\)/);
  expect(trigger()).toHaveTextContent('EN-GB');
  expect(document.documentElement).toHaveAttribute('lang', 'en-GB');
  expect(localStorage.getItem(ARCHITECT_LOCALE_KEY)).toBeNull();
});

it('names the language automatic resolves to and returns to it', async () => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-MX']);
  await renderAndOpen();
  expect(trigger()).toHaveTextContent('Auto · ES');
  expect(
    screen.getByRole('option', { name: /^Automático \(Español\)/ }),
  ).toBeInTheDocument();
  await choose(/^English \(UK\)/);
  expect(document.documentElement).toHaveAttribute('lang', 'en-GB');
  await open();
  await choose(/^Automatic/);
  expect(document.documentElement).toHaveAttribute('lang', 'es');
  expect(localStorage.getItem(ARCHITECT_LOCALE_KEY)).toBeNull();
});
