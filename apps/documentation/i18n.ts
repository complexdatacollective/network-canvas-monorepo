import { notFound } from 'next/navigation';
import { type AbstractIntlMessages } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

import { locales } from './locales.mjs';

export default getRequestConfig(async ({ locale }) => {
  // Validate that the incoming `locale` parameter is valid
  if (!locales.includes(locale)) notFound();

  const messages = (await import(`./messages/${locale}.json`)) as {
    default: AbstractIntlMessages;
  };

  return {
    messages,
  };
});
