import { useDirection } from '@base-ui/react/direction-provider';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { defineAppLocales } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';

import LocaleDirectionProvider from './LocaleDirectionProvider';

const locales = defineAppLocales([
  { locale: 'en', label: 'English', direction: 'ltr' },
  { locale: 'ar', label: 'العربية', direction: 'rtl' },
]);

/** What a Base UI component under the provider is told. */
function BaseUiDirection() {
  return <output>{useDirection()}</output>;
}

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('dir');
  document.documentElement.removeAttribute('lang');
});

describe('LocaleDirectionProvider', () => {
  it('tells Base UI the direction of the language on screen', () => {
    const { rerender } = render(
      <AppI18nProvider locale="ar" locales={locales}>
        <LocaleDirectionProvider>
          <BaseUiDirection />
        </LocaleDirectionProvider>
      </AppI18nProvider>,
    );
    expect(screen.getByRole('status').textContent).toBe('rtl');

    rerender(
      <AppI18nProvider locale="en" locales={locales}>
        <LocaleDirectionProvider>
          <BaseUiDirection />
        </LocaleDirectionProvider>
      </AppI18nProvider>,
    );
    expect(screen.getByRole('status').textContent).toBe('ltr');
  });

  it('is left to right without an app language above it', () => {
    render(
      <LocaleDirectionProvider>
        <BaseUiDirection />
      </LocaleDirectionProvider>,
    );
    expect(screen.getByRole('status').textContent).toBe('ltr');
  });
});
