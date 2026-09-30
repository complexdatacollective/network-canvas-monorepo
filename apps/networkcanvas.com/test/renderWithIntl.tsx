import { render, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import { siteAppCatalogs, siteAppLocales } from '~/lib/i18n/appLocales';
import type { Locale } from '~/lib/i18n/locales';
import { loadLocaleMessages } from '~/lib/i18n/messages';

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
        messages={siteAppCatalogs[locale]}
        manageDocument={false}
        timeZone="UTC"
      >
        {ui}
      </AppI18nProvider>
    </NextIntlClientProvider>,
  );
}
