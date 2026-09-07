import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { PSEUDO_LOCALE } from '@codaco/app-i18n/locales';
import { AppI18nProvider, useAppIntl } from '@codaco/app-i18n/react';

import { architectCatalogs } from '../locales/catalogs';
import { installArchitectIntl } from './imperative';
import { architectLocales } from './locales';
import {
  ARCHITECT_LOCALE_KEY,
  readLocalePreference,
  resolveDeviceLocale,
  writeLocalePreference,
} from './preference';

type LocalePreference = {
  preference: string | null;
  saved: boolean | null;
  setLocale: (locale: string | null) => void;
};

const PreferenceContext = createContext<LocalePreference | null>(null);

export function ArchitectI18nProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState(readLocalePreference);
  const [saved, setSaved] = useState<boolean | null>(null);
  const [browserRevision, setBrowserRevision] = useState(0);

  const setLocale = useCallback((locale: string | null) => {
    if (
      locale !== null &&
      !architectLocales.some((entry) => entry.locale === locale)
    )
      return;
    setSaved(locale === PSEUDO_LOCALE ? null : writeLocalePreference(locale));
    setPreference(locale);
  }, []);

  useEffect(() => {
    const languageChanged = () =>
      setBrowserRevision((revision) => revision + 1);
    const preferenceChanged = (event: StorageEvent) => {
      if (event.key !== ARCHITECT_LOCALE_KEY && event.key !== null) return;
      setPreference(readLocalePreference());
      setSaved(null);
    };
    window.addEventListener('languagechange', languageChanged);
    window.addEventListener('storage', preferenceChanged);
    return () => {
      window.removeEventListener('languagechange', languageChanged);
      window.removeEventListener('storage', preferenceChanged);
    };
  }, []);

  const locale = useMemo(() => {
    // The event revision invalidates browser negotiation only; explicit
    // preferences still win, including the non-persisted development locale.
    void browserRevision;
    return import.meta.env.DEV && preference === PSEUDO_LOCALE
      ? PSEUDO_LOCALE
      : resolveDeviceLocale(preference);
  }, [preference, browserRevision]);
  const value = useMemo(
    () => ({ preference, saved, setLocale }),
    [preference, saved, setLocale],
  );

  return (
    <PreferenceContext.Provider value={value}>
      <AppI18nProvider
        locale={locale}
        locales={architectLocales}
        messages={architectCatalogs[locale]}
        onLocaleChange={setLocale}
      >
        <ImperativeFormatter />
        {children}
      </AppI18nProvider>
    </PreferenceContext.Provider>
  );
}

export function useArchitectLocale(): LocalePreference | null {
  const context = useContext(PreferenceContext);
  return context;
}

function ImperativeFormatter() {
  const intl = useAppIntl();
  useLayoutEffect(() => {
    installArchitectIntl(intl);
  }, [intl]);
  return null;
}
