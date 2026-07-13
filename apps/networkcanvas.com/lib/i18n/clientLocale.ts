import { localeCookie, type Locale } from './locales';

export function getLocalizedPathname(locale: Locale, pathname: string) {
  const unlocalizedPath = pathname.replace(/^\/+|\/+$/g, '');

  return unlocalizedPath ? `/${locale}/${unlocalizedPath}/` : `/${locale}/`;
}

export function getLocaleCookie(locale: Locale) {
  return `${localeCookie.name}=${locale}; Path=/; Max-Age=${localeCookie.maxAge}; SameSite=Lax`;
}

export function switchLocale(locale: Locale, pathname: string) {
  document.cookie = getLocaleCookie(locale);
  window.location.assign(getLocalizedPathname(locale, pathname));
}
