'use client';

import { useLocale } from 'next-intl';
import { useSyncExternalStore } from 'react';

import LocaleSwitcher from '@codaco/fresco-ui/navigation/LocaleSwitcher';
import { siteAppLocales } from '~/lib/i18n/appLocales';
import { readLocalePreference, switchLocale } from '~/lib/i18n/clientLocale';
import { isLocale, type Locale } from '~/lib/i18n/locales';
import { usePathname } from '~/lib/i18n/navigation';
import { negotiateLocale } from '~/lib/i18n/negotiate';

// The preference cookie changes only through `switchLocale`, which reloads
// the page, so there is nothing to subscribe to.
const subscribeToPreference = () => () => undefined;

function subscribeToLanguages(onChange: () => void) {
  window.addEventListener('languagechange', onChange);
  return () => window.removeEventListener('languagechange', onChange);
}

const readAutomaticLocale = () => negotiateLocale(navigator.languages);

export function SiteLocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  // Both are read from the browser, so the server render (and hydration) uses
  // no preference and the page's own locale, and the browser's values follow.
  const preference = useSyncExternalStore<Locale | null>(
    subscribeToPreference,
    readLocalePreference,
    () => null,
  );
  const automaticLocale = useSyncExternalStore<Locale>(
    subscribeToLanguages,
    readAutomaticLocale,
    () => locale,
  );

  return (
    <LocaleSwitcher
      options={siteAppLocales}
      value={preference}
      automaticLocale={automaticLocale}
      searchable
      onChange={(next) => {
        if (next !== null && !isLocale(next)) return;
        switchLocale(next, pathname);
      }}
      display="label"
      side="top"
      align="start"
    />
  );
}
