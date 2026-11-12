'use client';

import { useLocale } from 'next-intl';
import { useSyncExternalStore } from 'react';

import LocaleSwitcher from '@codaco/fresco-ui/navigation/LocaleSwitcher';
import {
  negotiateLocale,
  readLocalePreferenceCookie,
  serializeLocalePreferenceCookies,
  siteLocalePreferenceCookie,
} from '@codaco/shared-consts';
import {
  documentationAppLocales,
  siteLocaleByDocumentationLocale,
} from '~/lib/i18n/appLocales';
import {
  defaultLocale,
  locales,
  toLocale,
  type Locale,
} from '~/lib/i18n/locales';

// The language cookie changes only through `switchLocale`, which loads another
// page, so there is nothing to subscribe to.
const subscribeToPreference = () => () => undefined;

function subscribeToLanguages(onChange: () => void) {
  window.addEventListener('languagechange', onChange);
  return () => window.removeEventListener('languagechange', onChange);
}

/**
 * The documentation language a reader chose on any Network Canvas website,
 * when the documentation offers it. A choice of a language the documentation
 * does not have reads as no choice, as it does in the locale edge function.
 */
function readPreference(): Locale | null {
  const stored = readLocalePreferenceCookie(
    siteLocalePreferenceCookie,
    document.cookie,
  );
  return stored === null ? null : (negotiateLocale([stored], locales) ?? null);
}

const readAutomaticLocale = () =>
  negotiateLocale(navigator.languages, locales, defaultLocale);

/** This page's address in another language, keeping the rest of the address. */
export function getLocalizedPathname(locale: Locale, pathname: string) {
  const [first, ...rest] = pathname.slice(1).split('/');
  const unlocalized = toLocale(first) === undefined ? [first, ...rest] : rest;
  return `/${[locale, ...unlocalized].join('/')}`;
}

function switchLocale(locale: Locale | null) {
  const target = locale ?? readAutomaticLocale();
  const cookies = serializeLocalePreferenceCookies(
    siteLocalePreferenceCookie,
    locale === null ? null : siteLocaleByDocumentationLocale[locale],
    window.location.host,
  );
  for (const cookie of cookies) {
    document.cookie = cookie;
  }
  window.location.assign(
    `${getLocalizedPathname(target, window.location.pathname)}${window.location.search}${window.location.hash}`,
  );
}

export default function DocumentationLocaleSwitcher() {
  const locale = useLocale();
  // Both are read from the browser, so the server render (and hydration) uses
  // no choice and the page's own language, and the browser's values follow.
  const preference = useSyncExternalStore<Locale | null>(
    subscribeToPreference,
    readPreference,
    () => null,
  );
  const automaticLocale = useSyncExternalStore<string>(
    subscribeToLanguages,
    readAutomaticLocale,
    () => locale,
  );

  return (
    <LocaleSwitcher
      options={documentationAppLocales}
      value={preference}
      automaticLocale={automaticLocale}
      onChange={(next) => {
        if (next === null) {
          switchLocale(null);
          return;
        }
        const chosen = toLocale(next);
        if (chosen !== undefined) switchLocale(chosen);
      }}
      display="label"
      side="top"
      align="start"
    />
  );
}
