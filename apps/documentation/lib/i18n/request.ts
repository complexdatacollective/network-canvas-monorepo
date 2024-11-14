import { type AbstractIntlMessages } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { type Locale, locales } from '~/app/types';

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = await requestLocale;
  // Validate that the incoming `locale` string exists in the locales array
  if (!locales.includes(locale as Locale)) {
    return {
      messages: {},
    };
  }

  const messages = (await import(`~/messages/${locale}.json`)) as {
    default: AbstractIntlMessages;
  };

  return {
    timeZone: 'Europe/London',
    messages,
  };
});
