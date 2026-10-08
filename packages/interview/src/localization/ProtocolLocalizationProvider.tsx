'use client';

import { invariant } from 'es-toolkit';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { ContentLocaleProvider } from '@codaco/fresco-ui/form/ContentLocale';
import type { PresentationalText } from '@codaco/fresco-ui/PresentationalText';
import {
  type LocaleMetadata,
  type LocaleTag,
  type LocalizationDeclaration,
  type LocalizedString,
  type ResolvedLocalizedString,
  resolveLocalizedString,
  selectProtocolLocale,
  sortByLanguageName,
} from '@codaco/protocol-validation';

import { languageMessages } from '../i18n/languageMessages';
import { resolveContentLocale } from './contentFormat';
import {
  createLocalizedMessageFormatter,
  type LocalizedMessageFormatter,
} from './messageFormatter';
import { toPresentationalText } from './presentationalText';

type ProtocolLocalizationState = Readonly<{
  locale: LocaleTag;
  /** The interview language, then the browser's: the order text falls back in. */
  resolutionOrder: readonly [LocaleTag, ...string[]];
  metadata: LocaleMetadata;
  options: readonly LocaleMetadata[];
  setLocale: (locale: LocaleTag) => void;
  localization: LocalizationDeclaration;
  format: LocalizedMessageFormatter;
}>;

const ProtocolLocalizationContext =
  createContext<ProtocolLocalizationState | null>(null);

const useProtocolLocalizationState = () => {
  const state = useContext(ProtocolLocalizationContext);
  invariant(
    state,
    'Protocol localization is only available inside a ProtocolLocalizationProvider',
  );
  return state;
};

const UNSPECIFIED_LOCALE = 'und';

/** The options describe each declared locale once, in any order. */
function assertOptionsMatchDeclaration(
  localization: LocalizationDeclaration,
  localeOptions: readonly LocaleMetadata[],
) {
  const described = new Set(localeOptions.map((option) => option.locale));
  const matches =
    localeOptions.length === localization.locales.length &&
    described.size === localeOptions.length &&
    localization.locales.every((locale) => described.has(locale));
  if (!matches) {
    throw new Error(
      `localeOptions must describe each of the protocol's declared locales once (declared: ${localization.locales.join(', ')}; received: ${localeOptions.map((option) => option.locale).join(', ')}). Derive them with getLocaleMetadata.`,
    );
  }
}

/**
 * Decides which protocol language the interview shows: the participant's
 * stated preference when there is one, otherwise the first of the browser's
 * languages the protocol declares, otherwise the protocol's default. Without a
 * stated preference the choice is made afresh on every load. A text with no
 * translation in that language falls back to the browser's other languages,
 * then to the protocol's default (see `resolveLocalizedString`).
 *
 * Labels and directions come from the host's `localeOptions`, never from
 * `Intl.DisplayNames` here: display names vary between JavaScript runtimes, so
 * deriving them again would make a server render and its hydration disagree.
 */
export function ProtocolLocalizationProvider({
  localization,
  localeOptions,
  requestedLocales,
  localePreference,
  recordedLocale,
  onLocalePreferenceChange,
  onLocaleRecorded,
  children,
}: {
  localization: LocalizationDeclaration;
  localeOptions: readonly LocaleMetadata[];
  requestedLocales: readonly string[];
  /** The participant's stated preference, or null to follow the browser. */
  localePreference: LocaleTag | null;
  /** The locale the session last recorded as shown. */
  recordedLocale: LocaleTag | null;
  onLocalePreferenceChange: (locale: LocaleTag) => void;
  /** Called after render when the locale shown differs from `recordedLocale`. */
  onLocaleRecorded: (locale: LocaleTag) => void;
  children: ReactNode;
}) {
  const intl = useAppIntl();
  const unspecifiedLabel = intl.formatMessage(
    languageMessages.unspecifiedLanguage,
  );

  const options = useMemo(() => {
    assertOptionsMatchDeclaration(localization, localeOptions);
    // `Intl.DisplayNames` names `und` "root", which means nothing to a
    // participant.
    const named = localeOptions.map((option) =>
      option.locale === UNSPECIFIED_LOCALE
        ? { ...option, label: unspecifiedLabel }
        : option,
    );
    return sortByLanguageName(named, (option) => option.label, intl.locale);
  }, [localization, localeOptions, unspecifiedLabel, intl.locale]);

  // A stated preference is passed as the only request, so a preference the
  // protocol no longer matches yields its default rather than a browser
  // language.
  const locale = useMemo(
    () =>
      selectProtocolLocale(
        localePreference === null ? requestedLocales : [localePreference],
        localization,
      ),
    [localePreference, requestedLocales, localization],
  );

  // A stated preference only chooses the interview language: the browser's
  // languages still come next for text that has no translation in it.
  const resolutionOrder = useMemo(
    (): readonly [LocaleTag, ...string[]] => [locale, ...requestedLocales],
    [locale, requestedLocales],
  );

  const metadata = options.find((option) => option.locale === locale);
  invariant(metadata, `No locale option describes "${locale}"`);

  useEffect(() => {
    if (recordedLocale !== locale) onLocaleRecorded(locale);
  }, [locale, recordedLocale, onLocaleRecorded]);

  const setLocale = useCallback(
    (next: LocaleTag) => {
      invariant(
        localization.locales.includes(next),
        `"${next}" is not one of the protocol's declared locales`,
      );
      onLocalePreferenceChange(next);
    },
    [localization, onLocalePreferenceChange],
  );

  const [format] = useState(createLocalizedMessageFormatter);

  const value = useMemo(
    () => ({
      locale,
      resolutionOrder,
      metadata,
      options,
      setLocale,
      localization,
      format,
    }),
    [
      locale,
      resolutionOrder,
      metadata,
      options,
      setLocale,
      localization,
      format,
    ],
  );

  return (
    <ProtocolLocalizationContext.Provider value={value}>
      <ContentLocaleProvider locale={locale}>{children}</ContentLocaleProvider>
    </ProtocolLocalizationContext.Provider>
  );
}

/**
 * The protocol language the interview shows, its presentation metadata, every
 * declared locale's metadata in alphabetical order of its name, collated for
 * the interface language, and a setter that records the participant's stated
 * preference.
 */
export function useProtocolLocale(): Readonly<{
  locale: LocaleTag;
  metadata: LocaleMetadata;
  options: readonly LocaleMetadata[];
  setLocale: (locale: LocaleTag) => void;
}> {
  const { locale, metadata, options, setLocale } =
    useProtocolLocalizationState();
  return useMemo(
    () => ({ locale, metadata, options, setLocale }),
    [locale, metadata, options, setLocale],
  );
}

/**
 * The language the protocol's own values are written for, to format and
 * alphabetise them in: the protocol language the interview shows. Participant
 * and protocol data sit among the protocol's text, so a participant reading
 * Hungarian gets Hungarian number formats and Hungarian alphabetical order even
 * when the interface falls back to English for want of a Hungarian catalog.
 * The form fields inside the interview follow it too (see
 * `ContentLocaleProvider`); sentences the interface itself speaks stay in the
 * interface language.
 *
 * Outside a `ProtocolLocalizationProvider` (a component shown on its own) it is
 * the interface language.
 */
export function useContentLocale(): string {
  const interfaceLocale = useAppIntl().locale;
  const protocolLocale = useContext(ProtocolLocalizationContext)?.locale;
  return resolveContentLocale(protocolLocale, interfaceLocale);
}

/**
 * Resolves protocol-authored strings for the interview language, falling back
 * to the browser's other languages, then to the protocol's default. `text` is
 * the formatted message, in the locale the text is actually written in.
 */
export function useResolveLocalizedString(): (
  value: LocalizedString,
) => ResolvedLocalizedString {
  const { localization, resolutionOrder, format } =
    useProtocolLocalizationState();
  return useCallback(
    (value: LocalizedString) => {
      const resolved = resolveLocalizedString(
        value,
        localization,
        resolutionOrder,
      );
      return { ...resolved, text: format(resolved.locale, resolved.text) };
    },
    [localization, resolutionOrder, format],
  );
}

export function useLocalizedString(
  value: LocalizedString,
): ResolvedLocalizedString {
  const resolve = useResolveLocalizedString();
  return useMemo(() => resolve(value), [resolve, value]);
}

/**
 * Resolves protocol-authored strings to the shape fresco-ui components take,
 * for lists (options, labels) where one hook call per string is impractical.
 */
export function useResolvePresentationalText(): (
  value: LocalizedString,
) => PresentationalText {
  const resolve = useResolveLocalizedString();
  const { options } = useProtocolLocalizationState();
  return useCallback(
    (value: LocalizedString) => toPresentationalText(resolve(value), options),
    [resolve, options],
  );
}

/** One protocol-authored string in the shape fresco-ui components take. */
export function usePresentationalText(
  value: LocalizedString,
): PresentationalText {
  const resolve = useResolvePresentationalText();
  return useMemo(() => resolve(value), [resolve, value]);
}
