import type { Config, Context } from '@netlify/edge-functions';

import {
  parseAcceptLanguage,
  readLocalePreferenceCookie,
  resolveLocale,
  siteLocalePreferenceCookie,
} from '@codaco/shared-consts';

import {
  defaultLocale,
  locales,
  toLocale,
  type Locale,
} from '../../lib/i18n/locales.ts';

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

// Whether the site answers an address, following none of its redirects: a
// redirect counts, since it leads to the page that took that address over.
async function exists(url: URL): Promise<boolean> {
  const response = await fetch(url, { method: 'HEAD', redirect: 'manual' });
  return response.status < 400;
}

/**
 * Every documentation address starts with a language the documentation
 * offers. An address that does not, and that the site cannot otherwise
 * answer, goes to the reader's language: the language goes in front
 * (`/design-protocols/x` becomes `/en/design-protocols/x`), unless only
 * replacing the first segment names a page (`/asd/design-protocols/x` becomes
 * `/en/design-protocols/x`). When neither names a page the language goes in
 * front, so the reader sees "not found" in their language. The redirect is
 * temporary because the answer depends on the request.
 */
export default async function localeRedirect(
  request: Request,
  context: Pick<Context, 'next'>,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const [first, ...rest] = url.pathname.slice(1).split('/');

  if (toLocale(first) !== undefined) return undefined;

  // Files, the old addresses netlify.toml redirects, and anything else the
  // site answers are left alone.
  if (url.pathname !== '/') {
    const response = await context.next();
    if (response.status !== 404) return response;
  }

  const locale = detectLocale(request);
  const prefixed = new URL(url);
  prefixed.pathname = `/${locale}${url.pathname === '/' ? '' : url.pathname}`;
  const replaced = new URL(url);
  replaced.pathname = `/${[locale, ...rest].join('/')}`;

  const target =
    url.pathname === '/' ||
    (await exists(prefixed)) ||
    !(await exists(replaced))
      ? prefixed
      : replaced;
  return Response.redirect(target, 307);
}

// Addresses with a file extension are files, never pages.
export const config: Config = {
  pattern: '^/[^.]*$',
};
