import { match } from '@formatjs/intl-localematcher';
import type { Config, Context } from '@netlify/edge-functions';

import {
  defaultSiteLocale,
  isSiteLocale,
  siteLocales,
  type SiteLocale,
} from '@codaco/shared-consts';

import { CLASSIC_DOWNLOAD_PATH_PREFIX } from '../../lib/classicDownloads.ts';
import { localeCookie } from '../../lib/i18n/locales.ts';
import {
  protocolGalleryHost,
  protocolGalleryPathPrefix,
} from '../../lib/protocolGalleryHosting.ts';

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

// The gallery's previous home published each study under an author-list slug.
// Those URLs are the ones in circulation and in citations.
const legacyGalleryPathPrefix = '/protocol/';
export const legacyGallerySlugs: Record<string, string> = {
  'tillson-m-annett-j-staton-m-schneider-j-oser-c': 'uk-jcoin-i',
  'manderson-l-brear-m-rusere-f-farrell-m-gómez-olivé-f-berkman-l-kahn-k-harling-g':
    'kaya',
  'nxumalo-v-nxumalo-s-smit-t-khoza-t-mdaba-f-khumalo-t-cislaghi-b-mcgrath-n-seeley-j-shahmanesh-m-harling-g':
    'sixhumene',
  'phillips-e-potter-c-poole-j-lewis-a-nahid-m-christos-p-hootman-k-winston-g-de-la-haye-k':
    'robust',
  'oser-c-batty-e-booty-m-eddens-k-knudsen-h-perry-b-rockett-m-staton-m':
    'gate',
  'bravo-a-butts-s-johnson-al-rodriguez-e-rabin-b-smith-l-kanamori-m-doblecki-lewis-s':
    'test-to-prep',
};

// Published at the site root, so they resolve identically on both hosts and
// must never take the gallery prefix.
const sharedRootPathPrefixes = [
  '/_next/',
  '/api/',
  '/.netlify/',
  '/images/',
  '/protocols/',
  '/videos/',
  `${CLASSIC_DOWNLOAD_PATH_PREFIX}/`,
];

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
  // Netlify normalizes static URL paths to lowercase before serving them.
  const normalizedPathname = pathname.toLowerCase();

  for (const locale of siteLocales) {
    const prefix = `/${locale.toLowerCase()}`;
    if (
      normalizedPathname === prefix ||
      normalizedPathname.startsWith(`${prefix}/`)
    ) {
      return {
        locale,
        unlocalizedPath: pathname.slice(prefix.length) || '/',
      };
    }
  }

  return undefined;
}

function getLocalizedPathname(locale: SiteLocale, pathname: string) {
  const unlocalizedPath = pathname.replace(/^\/+|\/+$/g, '');

  return unlocalizedPath ? `/${locale}/${unlocalizedPath}/` : `/${locale}/`;
}

function shouldBypass(pathname: string) {
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/.netlify/') ||
    pathname === CLASSIC_DOWNLOAD_PATH_PREFIX ||
    pathname.startsWith(`${CLASSIC_DOWNLOAD_PATH_PREFIX}/`) ||
    /\.[^/]+$/.test(pathname)
  );
}

export function detectLocale(
  request: Request,
  savedLocale?: string,
): SiteLocale {
  if (savedLocale && isSiteLocale(savedLocale)) return savedLocale;

  const requestedLocales = getRequestedLocales(
    request.headers.get('accept-language') ?? '',
  );
  const matchedLocale = match(
    requestedLocales,
    siteLocales,
    defaultSiteLocale,
    {
      algorithm: 'best fit',
    },
  );

  return isSiteLocale(matchedLocale) ? matchedLocale : defaultSiteLocale;
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

  const detectedLocale = detectLocale(request, savedLocale);
  url.pathname = legacyDownloadPaths.has(url.pathname)
    ? `/${detectedLocale}/get-started/`
    : getLocalizedPathname(detectedLocale, url.pathname);

  return url;
}

export function isProtocolGalleryHost(hostname: string) {
  return hostname === protocolGalleryHost;
}

export function getGalleryLegacyRedirect(url: URL, locale: SiteLocale) {
  if (!url.pathname.startsWith(legacyGalleryPathPrefix)) return undefined;

  let legacySlug: string;
  try {
    legacySlug = decodeURIComponent(
      url.pathname.slice(legacyGalleryPathPrefix.length),
    );
  } catch {
    return undefined;
  }

  const slug = legacyGallerySlugs[legacySlug.replace(/\/$/, '').toLowerCase()];
  if (!slug) return undefined;

  const redirect = new URL(url);
  redirect.pathname = `/${locale}/${slug}/`;
  return redirect;
}

/**
 * The exported route resolves on the gallery host too. Send it to the short
 * form so each page has a single URL there.
 */
export function getGalleryCanonicalRedirect(url: URL) {
  const pathLocale = getPathLocale(url.pathname);
  if (!pathLocale) return undefined;

  const { locale, unlocalizedPath } = pathLocale;
  if (
    unlocalizedPath !== protocolGalleryPathPrefix &&
    !unlocalizedPath.startsWith(`${protocolGalleryPathPrefix}/`)
  ) {
    return undefined;
  }

  const redirect = new URL(url);
  redirect.pathname = `/${locale}${unlocalizedPath.slice(protocolGalleryPathPrefix.length) || '/'}`;
  return redirect;
}

/**
 * Insert the exported route prefix after the locale segment. The gallery host
 * serves `/{locale}/{slug}/` from `/{locale}/protocol-gallery/{slug}/`, and
 * because the mapping is a plain prefix insertion it maps the per-directory RSC
 * payloads the client router fetches just as well as the HTML — which is why it
 * cannot reuse `shouldBypass`, whose extension test skips every `.txt`.
 */
export function getGalleryRewrite(url: URL) {
  if (
    sharedRootPathPrefixes.some((prefix) => url.pathname.startsWith(prefix))
  ) {
    return undefined;
  }

  const pathLocale = getPathLocale(url.pathname);
  if (!pathLocale) return undefined;

  const rewrite = new URL(url);
  rewrite.pathname = `/${pathLocale.locale}${protocolGalleryPathPrefix}${pathLocale.unlocalizedPath}`;
  return rewrite;
}

export default function localeRedirect(request: Request, context: Context) {
  const url = new URL(request.url);
  const savedLocale = context.cookies.get(localeCookie.name);
  const onGalleryHost = isProtocolGalleryHost(url.hostname);

  if (onGalleryHost) {
    const legacyRedirect = getGalleryLegacyRedirect(
      url,
      detectLocale(request, savedLocale),
    );
    if (legacyRedirect) return Response.redirect(legacyRedirect, 301);
  }

  const redirect = getLocaleRedirect(request, savedLocale);
  if (redirect) return Response.redirect(redirect, 307);

  if (!onGalleryHost) return context.next();

  const canonicalRedirect = getGalleryCanonicalRedirect(url);
  if (canonicalRedirect) return Response.redirect(canonicalRedirect, 301);

  const rewrite = getGalleryRewrite(url);
  return rewrite ? context.rewrite(rewrite) : context.next();
}

export const config: Config = {
  path: '/*',
};
