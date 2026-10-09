'use client';

import { DirectionProvider } from '@base-ui/react/direction-provider';
import { type ReactNode, useMemo } from 'react';

import { AppI18nProvider, useLocaleCatalog } from '@codaco/app-i18n/react';

import { type InterviewCatalog, interviewCatalogSource } from './catalog';
import {
  interviewLocales,
  type RequestedLocale,
  resolveInterviewLocale,
} from './locales';

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
 */
export function InterviewI18nProvider({
  requestedLocale,
  localePreference,
  catalog,
  children,
}: {
  requestedLocale?: RequestedLocale;
  localePreference?: string | null;
  catalog?: InterviewCatalog;
  children: ReactNode;
}) {
  const locale = useMemo(
    () => resolveInterviewLocale(requestedLocale, localePreference),
    [requestedLocale, localePreference],
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
    >
      <DirectionProvider direction={direction}>{children}</DirectionProvider>
    </AppI18nProvider>
  );
}
