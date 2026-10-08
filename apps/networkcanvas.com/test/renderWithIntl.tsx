import { render, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import { siteAppCatalogSource, siteAppLocales } from '~/lib/i18n/appLocales';
import { supportedLocales, type Locale } from '~/lib/i18n/locales';
import { loadLocaleMessages } from '~/lib/i18n/messages';

// Rendering is synchronous, so every locale a test can ask for is loaded
// before any test file that imports this helper runs.
await Promise.all(
  supportedLocales.map(({ locale }) => siteAppCatalogSource.load(locale)),
);

export function renderWithIntl(
  ui: ReactElement,
  locale: Locale = 'en-US',
): RenderResult {
  const messages = loadLocaleMessages(locale);

  return render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <AppI18nProvider
        locale={locale}
        locales={siteAppLocales}
        messages={siteAppCatalogSource.peek(locale)}
        manageDocument={false}
        timeZone="UTC"
      >
        {ui}
      </AppI18nProvider>
    </NextIntlClientProvider>,
  );
}
