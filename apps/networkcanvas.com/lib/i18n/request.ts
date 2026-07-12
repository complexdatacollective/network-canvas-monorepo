import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  if (!hasLocale(routing.locales, requested)) notFound();

  return {
    locale: requested,
    timeZone: 'UTC',
    messages: (await import(`../../messages/${requested}.json`)).default,
  };
});
