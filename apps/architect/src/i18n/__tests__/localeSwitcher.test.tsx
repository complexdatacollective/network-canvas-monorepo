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

const choose = (name: RegExp) => {
  fireEvent.click(screen.getByRole('option', { name }));
};

// The footer live region. Base UI's empty-state element is a live region too,
// and jsdom applies no stylesheet to hide it while the list has entries.
const status = () => {
  const region = screen.getAllByRole('status').at(-1);
  if (!region) throw new Error('no status region');
  return region;
};

it('applies a choice, stores it, and follows another tab’s change', async () => {
  await renderAndOpen();
  choose(/^English \(UK\)/);
  expect(status()).toHaveTextContent('Saved on this device.');
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
  choose(/^Þséûðö Éñglîsh/);
  expect(trigger()).toHaveTextContent('EN-XA');
  expect(document.documentElement).toHaveAttribute('lang', PSEUDO_LOCALE);
  expect(localStorage.getItem(ARCHITECT_LOCALE_KEY)).toBeNull();
  expect(status()).toBeEmptyDOMElement();
});

it('still applies the selected language when storage refuses the write, and offers a retry', async () => {
  await renderAndOpen();
  const setItem = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
  choose(/^English \(UK\)/);
  expect(trigger()).toHaveTextContent('EN-GB');
  expect(document.documentElement).toHaveAttribute('lang', 'en-GB');
  expect(localStorage.getItem(ARCHITECT_LOCALE_KEY)).toBeNull();
  expect(status()).toHaveTextContent(
    'Couldn’t save. The language applies for now.',
  );
  setItem.mockRestore();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(status()).toHaveTextContent('Saved on this device.');
  expect(localStorage.getItem(ARCHITECT_LOCALE_KEY)).toBe('en-GB');
});

it('names the language automatic resolves to and returns to it', async () => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-MX']);
  await renderAndOpen();
  expect(trigger()).toHaveTextContent('Auto · ES');
  expect(
    screen.getByRole('option', { name: /^Automático \(Español\)/ }),
  ).toBeInTheDocument();
  choose(/^English \(UK\)/);
  expect(document.documentElement).toHaveAttribute('lang', 'en-GB');
  choose(/^Automatic/);
  expect(document.documentElement).toHaveAttribute('lang', 'es');
  expect(localStorage.getItem(ARCHITECT_LOCALE_KEY)).toBeNull();
});
