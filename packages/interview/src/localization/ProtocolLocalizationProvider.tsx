'use client';

import { invariant } from 'es-toolkit';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { ContentLocaleProvider } from '@codaco/fresco-ui/form/ContentLocale';
import { messages as booleanFieldMessages } from '@codaco/fresco-ui/form/fields/Boolean';
import { getMarkdownLabelText } from '@codaco/fresco-ui/RenderMarkdown';
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

import { useDynamicValueSources } from '../dynamicValues/DynamicValueScope';
import {
  type DynamicTextPart,
  type DynamicValueFormatters,
  type DynamicValueSources,
  resolveDynamicText,
} from '../dynamicValues/resolveDynamicText';
import { contentFormatFor, resolveContentLocale } from './contentFormat';
import {
  createLocalizedMessageFormatter,
  type LocalizedMessageFormatter,
  type LocalizedMessageValues,
} from './messageFormatter';

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
  onLocalePreferenceChange,
  children,
}: {
  localization: LocalizationDeclaration;
  localeOptions: readonly LocaleMetadata[];
  requestedLocales: readonly string[];
  /** The participant's stated preference, or null to follow the browser. */
  localePreference: LocaleTag | null;
  onLocalePreferenceChange: (locale: LocaleTag) => void;
  children: ReactNode;
}) {
  const intl = useAppIntl();
  const options = useMemo(() => {
    assertOptionsMatchDeclaration(localization, localeOptions);
    return sortByLanguageName(
      localeOptions,
      (option) => option.label,
      intl.locale,
    );
  }, [localization, localeOptions, intl.locale]);

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
 * Protocol-authored text as the interview shows it. Where the text shows
 * dynamic values, `text` is the natural sentence with each value written in,
 * and `parts` says where each value sits, for a renderer that marks them out.
 */
export type ResolvedProtocolText = ResolvedLocalizedString &
  Readonly<{ parts?: readonly DynamicTextPart[] }>;

/**
 * Resolves protocol-authored strings for the interview language, falling back
 * to the browser's other languages, then to the protocol's default. `text` is
 * the formatted message, in the locale the text is actually written in.
 *
 * Inside a stage, text that shows the stage's dynamic values reads the
 * version its values choose, with the values written in the interview
 * language (see `resolveDynamicText`). The result is never stored: it is
 * resolved afresh against the live interview each time.
 */
export function useResolveLocalizedString(): (
  value: LocalizedString,
) => ResolvedProtocolText {
  const sources = useDynamicValueSources();
  const resolveIn = useResolveLocalizedStringIn();
  return useCallback(
    (value: LocalizedString) => resolveIn(value, sources),
    [resolveIn, sources],
  );
}

/**
 * `useResolveLocalizedString` with the dynamic values given rather than read
 * where it is called, for text resolved for somewhere else: a dialog about
 * one node, opened from an event (see `withDynamicValueEntities`).
 */
export function useResolveLocalizedStringIn(): (
  value: LocalizedString,
  sources: DynamicValueSources | null,
) => ResolvedProtocolText {
  const { localization, resolutionOrder, format, locale } =
    useProtocolLocalizationState();
  const intl = useAppIntl();
  return useCallback(
    (value: LocalizedString, sources: DynamicValueSources | null) => {
      const resolved = resolveLocalizedString(
        value,
        localization,
        resolutionOrder,
      );
      if (sources !== null) {
        const formatters: DynamicValueFormatters = {
          format: contentFormatFor(locale),
          resolveLabel: (label) => {
            const option = resolveLocalizedString(
              label,
              localization,
              resolutionOrder,
            );
            // An option's label is markdown; a value is only ever text.
            return getMarkdownLabelText(format(option.locale, option.text));
          },
          booleanWords: {
            yes: intl.formatMessage(booleanFieldMessages.yes),
            no: intl.formatMessage(booleanFieldMessages.no),
          },
        };
        const dynamic = resolveDynamicText(
          resolved.text,
          resolved.locale,
          sources,
          formatters,
        );
        if (dynamic !== undefined) {
          return { ...resolved, text: dynamic.text, parts: dynamic.parts };
        }
      }
      return { ...resolved, text: format(resolved.locale, resolved.text) };
    },
    [localization, resolutionOrder, format, locale, intl],
  );
}

export function useLocalizedString(
  value: LocalizedString,
): ResolvedProtocolText {
  const resolve = useResolveLocalizedString();
  return useMemo(() => resolve(value), [resolve, value]);
}

/**
 * `useLocalizedString` for a setting the stage holds only while its
 * configuration shows it (see `missingRequiredStageSettings`): its text, or
 * undefined where the stage does not hold it.
 */
export function useOptionalLocalizedText(
  value: LocalizedString | undefined,
): string | undefined {
  const resolve = useResolveLocalizedString();
  return useMemo(
    () => (value === undefined ? undefined : resolve(value).text),
    [resolve, value],
  );
}

/**
 * `useResolveLocalizedString` for a localized message (see
 * `localizedMessage`): the translation is chosen the same way, then
 * formatted with `values` in the language it is written in, so its plural
 * rules are that language's.
 */
export function useResolveLocalizedMessage(): (
  value: LocalizedString,
  values: LocalizedMessageValues,
) => ResolvedLocalizedString {
  const { localization, resolutionOrder, format } =
    useProtocolLocalizationState();
  return useCallback(
    (value: LocalizedString, values: LocalizedMessageValues) => {
      const resolved = resolveLocalizedString(
        value,
        localization,
        resolutionOrder,
      );
      return {
        ...resolved,
        text: format(resolved.locale, resolved.text, values),
      };
    },
    [localization, resolutionOrder, format],
  );
}
