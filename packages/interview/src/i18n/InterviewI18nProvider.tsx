'use client';

import { DirectionProvider } from '@base-ui/react/direction-provider';
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';

import { AppI18nProvider, useLocaleCatalog } from '@codaco/app-i18n/react';

import { type InterviewCatalog, interviewCatalogSource } from './catalog';
import {
  interviewLocales,
  type RequestedLocale,
  resolveInterviewLocale,
} from './locales';

const SettledPreferenceContext = createContext<
  { requested: string | null; settled: string | null } | undefined
>(undefined);

/**
 * The participant's language preference once the built-in text has changed
 * to it, or found it cannot, for protocol text to follow in the same render
 * rather than ahead of it. A preference this provider was not given is taken
 * as it is.
 */
export function useSettledLocalePreference(
  preference: string | null,
): string | null {
  const context = useContext(SettledPreferenceContext);
  return context?.requested === preference ? context.settled : preference;
}

/**
 * The built-in interface language: the participant's stated protocol language
 * when the interface has it, otherwise the first of the browser's languages it
 * has, otherwise English. Never stored; a host only supplies the browser's
 * languages.
 *
 * Mounting in a language whose catalog this page has not loaded yet suspends
 * until it has, rather than render English and swap, so a host renders this
 * under a Suspense boundary (`Shell` brings its own) or passes the matching
 * `catalog` from `loadInterviewCatalog`. Once mounted it never suspends again:
 * a later change keeps the current language on screen until the new one is
 * ready. A language that cannot be loaded leaves English (or, after a change,
 * the current language) on screen and is reported as `useLocaleLoadFailure`.
 *
 * The exception is `restoredPreference`, a preference the host read back from
 * storage after mounting: the interview is opening in it, not changing to
 * it, so changing to it suspends again until its language has loaded. Text
 * the interview words from the protocol then changes language in the same
 * render as the built-in text, never ahead of it.
 */
export function InterviewI18nProvider({
  requestedLocale,
  localePreference,
  restoredPreference,
  catalog,
  children,
}: {
  requestedLocale?: RequestedLocale;
  localePreference?: string | null;
  restoredPreference?: string | null;
  catalog?: InterviewCatalog;
  children: ReactNode;
}) {
  const locale = useMemo(
    () => resolveInterviewLocale(requestedLocale, localePreference),
    [requestedLocale, localePreference],
  );
  const restored = useMemo(
    () =>
      restoredPreference == null
        ? undefined
        : resolveInterviewLocale(requestedLocale, restoredPreference),
    [requestedLocale, restoredPreference],
  );
  const rendered = useLocaleCatalog(
    interviewCatalogSource,
    locale,
    catalog,
    restored,
  );
  // The preference whose built-in language is on screen, or failed to load.
  // While a new one loads, the previous one stays settled.
  const [settled, setSettled] = useState(localePreference ?? null);
  if (
    settled !== (localePreference ?? null) &&
    (rendered.locale === locale || rendered.failure?.locale === locale)
  ) {
    setSettled(localePreference ?? null);
  }
  const settledValue = useMemo(
    () => ({ requested: localePreference ?? null, settled }),
    [localePreference, settled],
  );
  const direction = interviewLocales.find(
    (entry) => entry.locale === rendered.locale,
  )!.direction;

  return (
    <AppI18nProvider
      locale={rendered.locale}
      locales={interviewLocales}
      messages={rendered.messages}
      loadFailure={rendered.failure}
      manageDocument={false}
    >
      <DirectionProvider direction={direction}>
        <SettledPreferenceContext.Provider value={settledValue}>
          {children}
        </SettledPreferenceContext.Provider>
      </DirectionProvider>
    </AppI18nProvider>
  );
}
