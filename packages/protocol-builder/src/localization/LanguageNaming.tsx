import { createContext, useContext, type ReactNode } from 'react';

import type { LocaleTag } from '@codaco/protocol-validation';

import { useLanguageName } from './languageNames.ts';
import { localeDirection } from './localizedText.ts';

type NameLanguage = (locale: LocaleTag) => string;

const HostLanguageNameContext = createContext<NameLanguage | null>(null);

type LanguageNamingProviderProps = Readonly<{
  /** Names a protocol language in the host's own interface language. */
  name: NameLanguage;
  children?: ReactNode;
}>;

/**
 * Lets the host name the protocol's languages the way the rest of its
 * interface does ("French" in an English Architect). Without one, the builder
 * names each language in its own language ("français").
 */
export function LanguageNamingProvider({
  name,
  children,
}: LanguageNamingProviderProps) {
  return (
    <HostLanguageNameContext.Provider value={name}>
      {children}
    </HostLanguageNameContext.Provider>
  );
}

type LanguageNaming = Readonly<{
  /** The host's name for the language, or its autonym when it has none. */
  name: NameLanguage;
  /** The language's name in its own language. */
  autonym: NameLanguage;
}>;

export function useLanguageNaming(): LanguageNaming {
  const autonym = useLanguageName();
  const hostName = useContext(HostLanguageNameContext);
  return { name: hostName ?? autonym, autonym };
}

/**
 * A language's name, marked as written in that language when it is its
 * autonym, so a screen reader pronounces it in that language.
 */
export function LanguageName({ locale }: Readonly<{ locale: LocaleTag }>) {
  const { name, autonym } = useLanguageNaming();
  const text = name(locale);
  return text === autonym(locale) ? (
    <span lang={locale} dir={localeDirection(locale)}>
      {text}
    </span>
  ) : (
    <span>{text}</span>
  );
}

/**
 * A language as a menu lists it: its name, then its autonym where the two
 * differ, so a researcher can find a language by either.
 */
export function LanguageOptionLabel({
  locale,
}: Readonly<{ locale: LocaleTag }>) {
  const { name, autonym } = useLanguageNaming();
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <LanguageName locale={locale} />
      {name(locale) !== autonym(locale) && (
        <span
          lang={locale}
          dir={localeDirection(locale)}
          className="text-sm text-current/70"
        >
          {autonym(locale)}
        </span>
      )}
    </span>
  );
}
