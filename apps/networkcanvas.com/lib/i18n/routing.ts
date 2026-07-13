import { defineRouting } from 'next-intl/routing';

import { locales } from './locales';

export const routing = defineRouting({
  locales,
  defaultLocale: 'en-US',
  localePrefix: 'always',
  localeDetection: true,
  localeCookie: {
    name: 'nf_lang',
    maxAge: 31_536_000,
    sameSite: 'lax',
  },
});
