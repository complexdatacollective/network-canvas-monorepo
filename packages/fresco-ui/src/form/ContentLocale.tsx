'use client';

import { createContext, type ReactNode, useContext, useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';

const ContentLocaleContext = createContext<string | null>(null);

/**
 * Names the language the values a form field shows are written in, when that
 * is not the interface language: a host that reads a study's text in one
 * language inside an interface in another (the interview) sets it, and a
 * date picker then names its months, and a scale writes its numbers, for the
 * language the surrounding text is in.
 *
 * It covers values, not sentences. Messages the interface itself speaks
 * ("Must be at least {min}") stay in the interface language with the numbers
 * and dates inside them, so a sentence is never half one language and half
 * another. Without a provider fields use the interface language.
 */
export function ContentLocaleProvider({
  locale,
  children,
}: {
  locale: string;
  children: ReactNode;
}) {
  return (
    <ContentLocaleContext.Provider value={locale}>
      {children}
    </ContentLocaleContext.Provider>
  );
}

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

const cached = <T,>(
  cache: Map<string, T>,
  locale: string,
  options: object | undefined,
  create: () => T,
): T => {
  const key = `${locale}|${JSON.stringify(options ?? {})}`;
  let format = cache.get(key);
  if (format === undefined) {
    format = create();
    cache.set(key, format);
  }
  return format;
};

export type FieldValueFormat = Readonly<{
  /** The BCP 47 tag values are formatted in. */
  locale: string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (date: Date, options?: Intl.DateTimeFormatOptions) => string;
}>;

/**
 * Formatters for the values a field shows, in the content language its host
 * named (`ContentLocaleProvider`), else the interface language.
 */
export function useFieldValueFormat(): FieldValueFormat {
  const interfaceLocale = useAppIntl().locale;
  const locale = useContext(ContentLocaleContext) ?? interfaceLocale;
  return useMemo(
    () => ({
      locale,
      formatNumber: (value, options) =>
        cached(
          numberFormats,
          locale,
          options,
          () => new Intl.NumberFormat(locale, options),
        ).format(value),
      formatDate: (date, options) =>
        cached(
          dateFormats,
          locale,
          options,
          () => new Intl.DateTimeFormat(locale, options),
        ).format(date),
    }),
    [locale],
  );
}
