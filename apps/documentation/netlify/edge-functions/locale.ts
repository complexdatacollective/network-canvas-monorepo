import type { Config } from '@netlify/edge-functions';

import {
  parseAcceptLanguage,
  readLocalePreferenceCookie,
  resolveLocale,
  siteLocalePreferenceCookie,
} from '@codaco/shared-consts';

import { defaultLocale, locales, type Locale } from '../../lib/i18n/locales.ts';

/**
 * The documentation language for a reader, decided the way every Network
 * Canvas website decides it: the language they chose on any of the websites
 * (the choice is shared across networkcanvas.com and its subdomains), then
 * the best fit for their browser's languages, then the default.
 */
export function detectLocale(request: Request): Locale {
  return resolveLocale({
    chosen: readLocalePreferenceCookie(
      siteLocalePreferenceCookie,
      request.headers.get('cookie'),
    ),
    requested: parseAcceptLanguage(request.headers.get('accept-language')),
    available: locales,
    fallback: defaultLocale,
  }).locale;
}

/**
 * Sends the site root to the reader's language. The redirect is temporary
 * because the answer depends on the request.
 */
export default function localeRedirect(request: Request) {
  const url = new URL(request.url);
  url.pathname = `/${detectLocale(request)}`;
  return Response.redirect(url, 307);
}

export const config: Config = {
  path: '/',
};
