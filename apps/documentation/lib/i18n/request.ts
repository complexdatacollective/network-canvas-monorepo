import { type AbstractIntlMessages, hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;

  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  // The catalog is the JSON module's default export. The bundler also exposes
  // its top-level keys on the module itself, which is why passing the module
  // happened to work, but the default export is the catalog.
  const { default: messages }: { default: AbstractIntlMessages } = await import(
    `~/messages/${locale}.json`
  );

  return {
    locale,
    timeZone: 'Europe/London',
    messages,
  };
});
