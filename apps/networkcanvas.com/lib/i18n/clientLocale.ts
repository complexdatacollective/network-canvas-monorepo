import {
  readLocalePreferenceCookie,
  serializeLocalePreferenceCookies,
} from '@codaco/shared-consts';

import { isLocale, localeCookie, locales, type Locale } from './locales';
import { negotiateLocale } from './negotiate';

export function getLocalizedPathname(locale: Locale, pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  const unlocalizedSegments = locales.some(
    (supportedLocale) =>
      supportedLocale.toLowerCase() === segments[0]?.toLowerCase(),
  )
    ? segments.slice(1)
    : segments;
  const unlocalizedPath = unlocalizedSegments.join('/');

  return unlocalizedPath ? `/${locale}/${unlocalizedPath}/` : `/${locale}/`;
}

/**
 * The cookies that keep a choice made on `host`, or forget it with null: on a
 * networkcanvas.com host, one choice for every Network Canvas website.
 */
export function getLocaleCookies(locale: Locale | null, host: string) {
  return serializeLocalePreferenceCookies(localeCookie, locale, host);
}

/** The language chosen in the site's switcher, when the site still offers it. */
export function readLocalePreference(): Locale | null {
  const stored = readLocalePreferenceCookie(localeCookie, document.cookie);
  return stored !== null && isLocale(stored) ? stored : null;
}

export function switchLocale(locale: Locale | null, pathname: string) {
  const target = locale ?? negotiateLocale(navigator.languages);

  for (const cookie of getLocaleCookies(locale, window.location.host)) {
    document.cookie = cookie;
  }
  window.location.assign(
    `${getLocalizedPathname(target, pathname)}${window.location.search}${window.location.hash}`,
  );
}
