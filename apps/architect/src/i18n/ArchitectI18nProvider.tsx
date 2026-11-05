import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { PSEUDO_LOCALE } from '@codaco/app-i18n/locales';
import {
  AppI18nProvider,
  useAppIntl,
  useLocaleCatalog,
} from '@codaco/app-i18n/react';

import { architectCatalogSource } from '../locales/catalogs';
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
  /** What the automatic entry resolves to on this device right now. */
  automaticLocale: string;
  /** Outcome of the last device write; the dev-only pseudo-locale is never written. */
  saveState: 'idle' | 'saved' | 'failed';
  setLocale: (locale: string | null) => void;
};

const PreferenceContext = createContext<LocalePreference | null>(null);

// The browser's languages, which decide the automatic entry, announce a change
// with `languagechange`.
const subscribeToLanguageChange = (onChange: () => void) => {
  window.addEventListener('languagechange', onChange);
  return () => window.removeEventListener('languagechange', onChange);
};
const readAutomaticLocale = () => resolveDeviceLocale(null);

export function ArchitectI18nProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState(readLocalePreference);
  const [saveState, setSaveState] =
    useState<LocalePreference['saveState']>('idle');

  const setLocale = useCallback((locale: string | null) => {
    if (
      locale !== null &&
      !architectLocales.some((entry) => entry.locale === locale)
    )
      return;
    setSaveState(
      locale === PSEUDO_LOCALE
        ? 'idle'
        : writeLocalePreference(locale)
          ? 'saved'
          : 'failed',
    );
    setPreference(locale);
  }, []);

  useEffect(() => {
    const preferenceChanged = (event: StorageEvent) => {
      if (event.key !== ARCHITECT_LOCALE_KEY && event.key !== null) return;
      setPreference(readLocalePreference());
      setSaveState('idle');
    };
    window.addEventListener('storage', preferenceChanged);
    return () => {
      window.removeEventListener('storage', preferenceChanged);
    };
  }, []);

  const automaticLocale = useSyncExternalStore(
    subscribeToLanguageChange,
    readAutomaticLocale,
  );
  // A change of browser language re-renders through `automaticLocale`, and
  // only matters here when no preference decides the language; explicit
  // preferences still win, including the non-persisted development locale.
  const locale =
    import.meta.env.DEV && preference === PSEUDO_LOCALE
      ? PSEUDO_LOCALE
      : resolveDeviceLocale(preference);
  const value = useMemo(
    () => ({ preference, automaticLocale, saveState, setLocale }),
    [preference, automaticLocale, saveState, setLocale],
  );
  // The startup language is loaded before the first render (main.tsx,
  // preview-main.tsx), so this only waits on a switch — during which the
  // previous language stays on screen.
  const catalog = useLocaleCatalog(architectCatalogSource, locale);

  return (
    <PreferenceContext.Provider value={value}>
      <AppI18nProvider
        locale={catalog.locale}
        locales={architectLocales}
        messages={catalog.messages}
        loadFailure={catalog.failure}
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
