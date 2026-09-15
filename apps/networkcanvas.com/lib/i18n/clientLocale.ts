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

export function getLocaleCookie(locale: Locale) {
  return `${localeCookie.name}=${locale}; Path=/; Max-Age=${localeCookie.maxAge}; SameSite=Lax`;
}

export function getClearedLocaleCookie() {
  return `${localeCookie.name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function readLocalePreference(): Locale | null {
  const stored = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${localeCookie.name}=`))
    ?.slice(localeCookie.name.length + 1);

  return stored !== undefined && isLocale(stored) ? stored : null;
}

export function switchLocale(locale: Locale | null, pathname: string) {
  const target = locale ?? negotiateLocale(navigator.languages);

  document.cookie =
    locale === null ? getClearedLocaleCookie() : getLocaleCookie(locale);
  window.location.assign(
    `${getLocalizedPathname(target, pathname)}${window.location.search}${window.location.hash}`,
  );
}
