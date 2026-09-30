'use client';

import { useLocale } from 'next-intl';
import { useEffect, useState } from 'react';

import LocaleSwitcher from '@codaco/fresco-ui/navigation/LocaleSwitcher';
import { siteAppLocales } from '~/lib/i18n/appLocales';
import { readLocalePreference, switchLocale } from '~/lib/i18n/clientLocale';
import { isLocale, type Locale } from '~/lib/i18n/locales';
import { usePathname } from '~/lib/i18n/navigation';
import { negotiateLocale } from '~/lib/i18n/negotiate';

export function SiteLocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const [preference, setPreference] = useState<Locale | null>(null);
  const [automaticLocale, setAutomaticLocale] = useState<Locale>(locale);

  useEffect(() => {
    setPreference(readLocalePreference());
    setAutomaticLocale(negotiateLocale(navigator.languages));
  }, []);

  return (
    <LocaleSwitcher
      options={siteAppLocales}
      value={preference}
      automaticLocale={automaticLocale}
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
