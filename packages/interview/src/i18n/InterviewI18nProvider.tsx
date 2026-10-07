'use client';

import { DirectionProvider } from '@base-ui/react/direction-provider';
import { type ReactNode, useMemo } from 'react';

import { commonCatalogs } from '@codaco/app-i18n/common';
import { mergeCatalogs, type CatalogMessages } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';
import { frescoUiCatalogs } from '@codaco/fresco-ui/locales';

import { interviewCatalogs } from '../locales/catalogs';
import {
  interviewLocales,
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

/**
 * The built-in interface language: the participant's stated protocol language
 * when the interface has it, otherwise the first of the browser's languages it
 * has, otherwise English. Never stored; a host only supplies the browser's
 * languages.
 */
export function InterviewI18nProvider({
  requestedLocale,
  localePreference,
  children,
}: {
  requestedLocale?: RequestedLocale;
  localePreference?: string | null;
  children: ReactNode;
}) {
  const locale = useMemo(
    () => resolveInterviewLocale(requestedLocale, localePreference),
    [requestedLocale, localePreference],
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
    >
      <DirectionProvider direction={direction}>{children}</DirectionProvider>
    </AppI18nProvider>
  );
}
