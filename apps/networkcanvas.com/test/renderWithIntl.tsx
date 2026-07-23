import { render, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';

import type { Locale } from '~/lib/i18n/locales';
import { loadLocaleMessages } from '~/lib/i18n/messages';

export function renderWithIntl(
  ui: ReactElement,
  locale: Locale = 'en-US',
): RenderResult {
  const messages = loadLocaleMessages(locale);

  return render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );
}
