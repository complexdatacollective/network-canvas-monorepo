import { createContext, useContext, type ReactNode } from 'react';

import type { LocaleTag } from '@codaco/protocol-validation';

import { useLanguageName } from './languageNames.ts';

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
