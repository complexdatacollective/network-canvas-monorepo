import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { LocaleTag } from '@codaco/protocol-validation';

import {
  type ProtocolLocalization,
  type ResolvedTranslation,
  resolveTranslation,
} from './localizedText.ts';

export type EditingLanguage = Readonly<{
  /** The protocol's declared languages; undefined until its settings are read. */
  localization: ProtocolLocalization | undefined;
  /**
   * The language every localized field edits and every preview shows. One for
   * the whole editor, so a researcher translating a stage works through it in
   * one language instead of switching field by field. Starts at the protocol's
   * default language.
   */
  locale: LocaleTag | undefined;
  /**
   * The language that text is edited and shown in: `locale` once the
   * protocol's settings are read, and English until then. For a control
   * that always needs a language; `locale` says whether the settings have
   * been read.
   */
  editingLocale: LocaleTag;
  setLocale: (locale: LocaleTag) => void;
}>;

/** The language of text before the protocol's languages are read. */
const UNREAD_LOCALE: LocaleTag = 'en';

const NO_LANGUAGE: EditingLanguage = Object.freeze({
  localization: undefined,
  locale: undefined,
  editingLocale: UNREAD_LOCALE,
  setLocale: () => undefined,
});

const EditingLanguageContext = createContext<EditingLanguage>(NO_LANGUAGE);

export type ProtocolLocalizationProviderProps = Readonly<{
  localization: ProtocolLocalization | undefined;
  /** The language to edit first; the default language when unset or undeclared. */
  initialLocale?: LocaleTag;
  children?: ReactNode;
}>;

export function ProtocolLocalizationProvider({
  localization,
  initialLocale,
  children,
}: ProtocolLocalizationProviderProps) {
  const [selected, setSelected] = useState<LocaleTag | undefined>(
    initialLocale,
  );
  // A language removed from the protocol while it was selected falls back to
  // the default rather than leaving every field editing a language that is no
  // longer declared.
  const locale =
    localization === undefined
      ? undefined
      : selected !== undefined && localization.locales.includes(selected)
        ? selected
        : localization.defaultLocale;
  const setLocale = useCallback((next: LocaleTag) => setSelected(next), []);

  const value = useMemo(
    () => ({
      localization,
      locale,
      editingLocale: locale ?? UNREAD_LOCALE,
      setLocale,
    }),
    [localization, locale, setLocale],
  );

  return (
    <EditingLanguageContext.Provider value={value}>
      {children}
    </EditingLanguageContext.Provider>
  );
}

export function useEditingLanguage(): EditingLanguage {
  return useContext(EditingLanguageContext);
}

/** The protocol's declared languages; undefined until its settings are read. */
export function useProtocolLocalization(): ProtocolLocalization | undefined {
  return useContext(EditingLanguageContext).localization;
}

/**
 * Resolves protocol copy for a preview: the editing language's translation, or
 * the one a participant in that language would be shown instead when their
 * browser lists no other protocol language.
 */
export function useLocalizedText(): (value: unknown) => ResolvedTranslation {
  const { localization, locale } = useContext(EditingLanguageContext);
  return useCallback(
    (value: unknown) => resolveTranslation(value, localization, locale),
    [localization, locale],
  );
}
