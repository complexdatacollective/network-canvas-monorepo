'use client';

import { DirectionProvider } from '@base-ui/react/direction-provider';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import { AppI18nProvider, useLocaleCatalog } from '@codaco/app-i18n/react';

import { type InterviewCatalog, interviewCatalogSource } from './catalog';
import {
  interviewLocales,
  negotiateInterviewLocale,
  type RequestedLocale,
  resolveInterviewLocale,
} from './locales';

/**
 * The menu's side of the locale: what the participant asked for, not what is
 * on screen. The two differ while a newly chosen language loads, and the menu
 * has to show the choice already made — a select that snapped back to the
 * old language until the catalog arrived would read as a refused choice. The
 * language on screen is `useAppLocale()`'s, which is what `lang`, `dir` and
 * formatting follow.
 */
type InterviewLocaleState = Readonly<{
  preference: string | null;
  setPreference: (locale: string | null) => void;
}>;

const InterviewLocaleContext = createContext<InterviewLocaleState | null>(null);

/** Null outside a Shell: standalone controls retain provider-optional English. */
export const useInterviewLocale = () => useContext(InterviewLocaleContext);

/**
 * The interview's locale boundary: negotiates the requested locale against the
 * interview's own languages and provides its messages.
 *
 * Mounting in a language whose catalog this page has not loaded yet suspends
 * until it has, rather than render English and swap, so a host renders this
 * under a Suspense boundary (`Shell` brings its own) or passes the matching
 * `catalog` from `loadInterviewCatalog`. Once mounted it never suspends again:
 * a later switch keeps the current language on screen until the new one is
 * ready. A language that cannot be loaded leaves English (or, after a switch,
 * the current language) on screen and is reported as `useLocaleLoadFailure`.
 */
export function InterviewI18nProvider({
  requestedLocale,
  localePreference,
  onLocaleChange,
  catalog,
  children,
}: {
  requestedLocale?: RequestedLocale;
  localePreference?: string | null;
  onLocaleChange?: (locale: string | null) => void;
  catalog?: InterviewCatalog;
  children: ReactNode;
}) {
  const requestKey = JSON.stringify(requestedLocale ?? null);
  const [selection, setSelection] = useState<{
    requestKey: string;
    locale: string | null;
    awaitingHost: boolean;
  }>({ requestKey, locale: null, awaitingHost: false });
  const currentSelection =
    selection.requestKey === requestKey
      ? selection
      : {
          requestKey,
          locale:
            selection.awaitingHost &&
            selection.locale === resolveInterviewLocale(requestedLocale)
              ? selection.locale
              : null,
          awaitingHost: false,
        };
  if (currentSelection !== selection) {
    setSelection(currentSelection);
  }
  // A host can acknowledge a menu choice by persisting it and passing the
  // resulting locale back. Keep that explicit selection so Automatic remains
  // actionable; a different host request takes over immediately. Neither path
  // remounts the interview or restores an override from an earlier request.
  const rawPreference =
    localePreference === undefined ? currentSelection.locale : localePreference;
  const resolution = useMemo(
    () => negotiateInterviewLocale(requestedLocale, rawPreference),
    [requestedLocale, rawPreference],
  );
  const { locale } = resolution;
  // A malformed or withdrawn controlled preference must fall through to the
  // host's requested list. Do not turn a failed match into an English override.
  const preference = resolution.source === 'stored' ? locale : null;
  const setPreference = useCallback(
    (next: string | null) => {
      if (
        next !== null &&
        !interviewLocales.some((entry) => entry.locale === next)
      )
        return;
      setSelection({
        requestKey,
        locale: next,
        awaitingHost: Boolean(onLocaleChange && next !== null),
      });
      onLocaleChange?.(next);
    },
    [onLocaleChange, requestKey],
  );
  const value = useMemo(
    () => ({ preference, setPreference }),
    [preference, setPreference],
  );
  const rendered = useLocaleCatalog(interviewCatalogSource, locale, catalog);
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
      onLocaleChange={setPreference}
    >
      <InterviewLocaleContext.Provider value={value}>
        <DirectionProvider direction={direction}>{children}</DirectionProvider>
      </InterviewLocaleContext.Provider>
    </AppI18nProvider>
  );
}
