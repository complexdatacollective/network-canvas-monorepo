import { localeCookie, locales, type Locale } from './locales';

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

export function getLocaleCookie(locale: Locale) {
  return `${localeCookie.name}=${locale}; Path=/; Max-Age=${localeCookie.maxAge}; SameSite=Lax`;
}

export function switchLocale(locale: Locale, pathname: string) {
  document.cookie = getLocaleCookie(locale);
  window.location.assign(getLocalizedPathname(locale, pathname));
}
