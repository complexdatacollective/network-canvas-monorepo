import { defineRouting } from 'next-intl/routing';

import { defaultLocale, localeCookie, locales } from './locales';

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
  localeDetection: true,
  localeCookie,
});
