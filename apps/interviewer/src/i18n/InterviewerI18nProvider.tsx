import { DirectionProvider } from '@base-ui/react/direction-provider';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import { PSEUDO_LOCALE } from '@codaco/app-i18n/locales';
import { resolveAppLocale } from '@codaco/app-i18n/negotiate';
import { AppI18nProvider } from '@codaco/app-i18n/react';

import { interviewerCatalogs } from '../locales/catalogs';
import {
  interviewerDefaultLocale,
  interviewerLocales,
  interviewerProductionLocales,
} from './locales';
import {
  browserLanguages,
  LOCALE_PREFERENCE_KEY,
  readPreference,
} from './preference';

type LocalePreference = Readonly<{
  preference: string | null;
  saveState: 'idle' | 'saved' | 'failed';
  setPreference: (locale: string | null) => void;
}>;

// Standalone component stories retain the provider-optional English behavior.
const PreferenceContext = createContext<LocalePreference>({
  preference: null,
  saveState: 'idle',
  setPreference: () => {},
});

export function useInterviewerLocale(): LocalePreference {
  return useContext(PreferenceContext);
}

export function InterviewerI18nProvider({ children }: { children: ReactNode }) {
  const [preference, setCurrentPreference] = useState(readPreference);
  const [requested, setRequested] = useState(browserLanguages);
  const [saveState, setSaveState] =
    useState<LocalePreference['saveState']>('idle');

  const setPreference = useCallback((next: string | null) => {
    if (
      next !== null &&
      !interviewerLocales.some((entry) => entry.locale === next)
    )
      return;
    setCurrentPreference(next);
    if (next === PSEUDO_LOCALE) {
      // Development inspection must not replace a real device preference.
      setSaveState('idle');
      return;
    }
    try {
      if (next === null) localStorage.removeItem(LOCALE_PREFERENCE_KEY);
      else localStorage.setItem(LOCALE_PREFERENCE_KEY, next);
      setSaveState('saved');
    } catch {
      // Apply the current choice even when storage is blocked, and tell the
      // researcher that reloading cannot restore it.
      setSaveState('failed');
    }
    setRequested(browserLanguages());
  }, []);

  useEffect(() => {
    const languageChanged = () => setRequested(browserLanguages());
    const preferenceChanged = (event: StorageEvent) => {
      if (event.key !== LOCALE_PREFERENCE_KEY && event.key !== null) return;
      setCurrentPreference(readPreference());
      setSaveState('idle');
    };
    window.addEventListener('languagechange', languageChanged);
    window.addEventListener('storage', preferenceChanged);
    return () => {
      window.removeEventListener('languagechange', languageChanged);
      window.removeEventListener('storage', preferenceChanged);
    };
  }, []);

  const locale =
    preference === PSEUDO_LOCALE
      ? preference
      : resolveAppLocale({
          stored: preference,
          requested,
          locales: interviewerProductionLocales,
          defaultLocale: interviewerDefaultLocale,
        }).locale;

  return (
    <AppI18nProvider
      locale={locale}
      locales={interviewerLocales}
      messages={interviewerCatalogs[locale]}
      onLocaleChange={setPreference}
    >
      <PreferenceContext.Provider
        value={{ preference, saveState, setPreference }}
      >
        <DirectionProvider
          direction={
            interviewerLocales.find((entry) => entry.locale === locale)
              ?.direction ?? 'ltr'
          }
        >
          {children}
        </DirectionProvider>
      </PreferenceContext.Provider>
    </AppI18nProvider>
  );
}
