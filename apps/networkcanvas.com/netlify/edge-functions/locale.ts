import { match } from '@formatjs/intl-localematcher';
import type { Config, Context } from '@netlify/edge-functions';

import {
  defaultLocale,
  isLocale,
  localeCookie,
  locales,
  type Locale,
} from '../../lib/i18n/locales.ts';

type RequestedLocale = {
  locale: string;
  quality: number;
  order: number;
};

const legacyDownloadPaths = new Set([
  '/download',
  '/download/',
  '/download.html',
]);

function canonicalizeLocale(value: string) {
  try {
    return Intl.getCanonicalLocales(value)[0];
  } catch {
    return undefined;
  }
}

function parseQuality(parameters: string[]) {
  const qualityParameter = parameters.find((parameter) =>
    parameter.trim().toLowerCase().startsWith('q='),
  );
  if (!qualityParameter) return 1;

  const quality = Number(qualityParameter.split('=')[1]);
  return Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0;
}

function getRequestedLocales(header: string) {
  return header
    .split(',')
    .map<RequestedLocale | undefined>((entry, order) => {
      const [language, ...parameters] = entry.split(';');
      const locale = canonicalizeLocale(language?.trim() ?? '');
      const quality = parseQuality(parameters);

      return locale && quality > 0 ? { locale, quality, order } : undefined;
    })
    .filter((entry): entry is RequestedLocale => entry !== undefined)
    .toSorted(
      (left, right) => right.quality - left.quality || left.order - right.order,
    )
    .map(({ locale }) => locale);
}

function getPathLocale(pathname: string) {
  for (const locale of locales) {
    const prefix = `/${locale}`;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return {
        locale,
        unlocalizedPath: pathname.slice(prefix.length) || '/',
      };
    }
  }

  return undefined;
}

function getLocalizedPathname(locale: Locale, pathname: string) {
  const unlocalizedPath = pathname.replace(/^\/+|\/+$/g, '');

  return unlocalizedPath ? `/${locale}/${unlocalizedPath}/` : `/${locale}/`;
}

function shouldBypass(pathname: string) {
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/.netlify/') ||
    /\.[^/]+$/.test(pathname)
  );
}

export function detectLocale(request: Request, savedLocale?: string): Locale {
  if (savedLocale && isLocale(savedLocale)) return savedLocale;

  const requestedLocales = getRequestedLocales(
    request.headers.get('accept-language') ?? '',
  );
  const matchedLocale = match(requestedLocales, locales, defaultLocale, {
    algorithm: 'best fit',
  });

  return isLocale(matchedLocale) ? matchedLocale : defaultLocale;
}

export function getLocaleRedirect(request: Request, savedLocale?: string) {
  const url = new URL(request.url);
  const pathLocale = getPathLocale(url.pathname);

  if (pathLocale) {
    if (!legacyDownloadPaths.has(pathLocale.unlocalizedPath)) return undefined;

    url.pathname = `/${pathLocale.locale}/get-started/`;
    return url;
  }

  if (shouldBypass(url.pathname) && !legacyDownloadPaths.has(url.pathname)) {
    return undefined;
  }

  const locale = detectLocale(request, savedLocale);
  url.pathname = legacyDownloadPaths.has(url.pathname)
    ? `/${locale}/get-started/`
    : getLocalizedPathname(locale, url.pathname);

  return url;
}

export default function localeRedirect(request: Request, context: Context) {
  const redirect = getLocaleRedirect(
    request,
    context.cookies.get(localeCookie.name),
  );

  return redirect ? Response.redirect(redirect, 307) : context.next();
}

export const config: Config = {
  path: '/*',
};
