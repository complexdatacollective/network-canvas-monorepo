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

import { commonCatalogs } from '@codaco/app-i18n/common';
import { mergeCatalogs, type CatalogMessages } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';
import { frescoUiCatalogs } from '@codaco/fresco-ui/locales';

import { interviewCatalogs } from '../locales/catalogs';
import {
  interviewLocales,
  negotiateInterviewLocale,
  type RequestedLocale,
  resolveInterviewLocale,
} from './locales';

// Static imports keep every supported interface language available offline.
// Each Shell owns its formatter; no parent catalog or mutable global locale
// can leak a researcher's language into another interview on the same page.
const messages: Readonly<Record<string, CatalogMessages>> = Object.fromEntries(
  interviewLocales.map(({ locale }) => [
    locale,
    mergeCatalogs(
      commonCatalogs[locale] ?? {},
      frescoUiCatalogs[locale] ?? {},
      interviewCatalogs[locale] ?? {},
    ),
  ]),
);

type InterviewLocaleState = Readonly<{
  locale: string;
  preference: string | null;
  setPreference: (locale: string | null) => void;
}>;

const InterviewLocaleContext = createContext<InterviewLocaleState | null>(null);

/** Null outside a Shell: standalone controls retain provider-optional English. */
export const useInterviewLocale = () => useContext(InterviewLocaleContext);

export function InterviewI18nProvider({
  requestedLocale,
  localePreference,
  onLocaleChange,
  children,
}: {
  requestedLocale?: RequestedLocale;
  localePreference?: string | null;
  onLocaleChange?: (locale: string | null) => void;
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
    () => ({ locale, preference, setPreference }),
    [locale, preference, setPreference],
  );
  const direction = interviewLocales.find(
    (entry) => entry.locale === locale,
  )!.direction;

  return (
    <AppI18nProvider
      locale={locale}
      locales={interviewLocales}
      messages={messages[locale]}
      manageDocument={false}
      onLocaleChange={setPreference}
    >
      <InterviewLocaleContext.Provider value={value}>
        <DirectionProvider direction={direction}>{children}</DirectionProvider>
      </InterviewLocaleContext.Provider>
    </AppI18nProvider>
  );
}
