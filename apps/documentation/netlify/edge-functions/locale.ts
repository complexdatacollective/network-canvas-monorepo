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
 * Sends the site root, and any documentation page linked without a language,
 * to the reader's language: `/design-protocols/x` becomes
 * `/en/design-protocols/x`. The redirect is temporary because the answer
 * depends on the request.
 */
export default function localeRedirect(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname === '/' ? '' : url.pathname;
  url.pathname = `/${detectLocale(request)}${path}`;
  return Response.redirect(url, 307);
}

// Edge functions run before netlify.toml's redirects, so these paths never
// reach its `/*` fallback. One entry pair per section in `app/types.ts`
// (Deno cannot load that module); a test keeps the lists in step.
export const config: Config = {
  path: [
    '/',
    '/get-started',
    '/get-started/*',
    '/design-protocols',
    '/design-protocols/*',
    '/collect-data',
    '/collect-data/*',
    '/analyze-data',
    '/analyze-data/*',
  ],
};
