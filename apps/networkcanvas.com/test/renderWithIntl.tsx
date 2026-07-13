import { render, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';

import type { Locale } from '~/lib/i18n/locales';
import en from '~/messages/en.json';
import es from '~/messages/es.json';

export function renderWithIntl(
  ui: ReactElement,
  locale: Locale = 'en-US',
): RenderResult {
  const messages = locale === 'es' ? es : en;

  return render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );
}
