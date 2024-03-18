import { type AbstractIntlMessages } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { locales } from './app/types';

export default getRequestConfig(async ({ locale }) => {
  // Validate that the incoming `locale` string exists in the locales array
  if (!locales.includes(locale as 'en' | 'ru')) {
    return {
      messages: {},
    };
  }

  const messages = (await import(`./messages/${locale}.json`)) as {
    default: AbstractIntlMessages;
  };

  return {
    messages,
  };
});
