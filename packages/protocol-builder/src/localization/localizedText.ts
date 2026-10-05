import {
  CurrentProtocolSchema,
  escapeMessageText,
  getLocaleMetadata,
  type LocaleTag,
  type LocalizedString,
  messageText,
  resolveLocalizedString,
} from '@codaco/protocol-validation';

/** The protocol's declared languages, as its settings hold them. */
export type ProtocolLocalization = Readonly<{
  defaultLocale: LocaleTag;
  locales: readonly LocaleTag[];
}>;

/** How a translation is shown: its text, and the language it is written in. */
export type ResolvedTranslation = Readonly<{
  text: string;
  lang?: LocaleTag;
  dir?: 'ltr' | 'rtl';
}>;

const NO_TRANSLATION: ResolvedTranslation = Object.freeze({ text: '' });

/** The protocol's language declaration, or undefined where it is not valid. */
export function protocolLocalizationOf(
  settings: Readonly<Record<string, unknown>>,
): ProtocolLocalization | undefined {
  const result = CurrentProtocolSchema.shape.localization.safeParse(
    settings.localization,
  );
  return result.success ? result.data : undefined;
}

export function isLocalizedString(value: unknown): value is LocalizedString {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((text) => typeof text === 'string')
  );
}

/** A localized string holding at least one translation, else undefined. */
export function asLocalizedString(value: unknown): LocalizedString | undefined {
  return isLocalizedString(value) && Object.keys(value).length > 0
    ? value
    : undefined;
}

/** The plain text of one translation, or `''` where there is none. */
export function translationText(value: unknown, locale: LocaleTag): string {
  if (!isLocalizedString(value)) return '';
  const message = value[locale];
  return message === undefined ? '' : messageText(message);
}

/**
 * `value` with one translation replaced. Blank text — empty, or only
 * whitespace — removes that translation rather than storing one a participant
 * would see as nothing, and a string left with no translation at all is
 * absent. That is what lets a required field refuse a blank answer: Fresco's
 * check reads a map with any key in it as answered.
 */
export function withTranslation(
  value: unknown,
  locale: LocaleTag,
  text: string,
): LocalizedString | undefined {
  const others = Object.entries(asLocalizedString(value) ?? {}).filter(
    ([key]) => key !== locale,
  );
  const next = Object.fromEntries(
    text.trim() === ''
      ? others
      : [...others, [locale, escapeMessageText(text)]],
  );
  return Object.keys(next).length === 0 ? undefined : next;
}

/** Text written by this editor rather than typed, in the default language. */
export function localizedFromText(
  localization: ProtocolLocalization,
  text: string,
): LocalizedString {
  return { [localization.defaultLocale]: escapeMessageText(text) };
}

/** The declared languages `value` has no translation for, in declared order. */
export function missingLocales(
  value: unknown,
  localization: ProtocolLocalization,
): LocaleTag[] {
  const translations = asLocalizedString(value) ?? {};
  return localization.locales.filter(
    (locale) => !Object.hasOwn(translations, locale),
  );
}

export function localeDirection(locale: LocaleTag): 'ltr' | 'rtl' {
  return getLocaleMetadata(locale).direction;
}

/**
 * What a participant reading in `locale` would see, falling back exactly as
 * the interview does. Empty when the string has no declared translation.
 *
 * Without a declaration — a settings section that has not arrived — the first
 * translation the string holds stands in, so a preview is never blank merely
 * because it rendered first.
 */
export function resolveTranslation(
  value: unknown,
  localization: ProtocolLocalization | undefined,
  locale: LocaleTag | undefined,
): ResolvedTranslation {
  const translations = asLocalizedString(value);
  if (translations === undefined) return NO_TRANSLATION;

  if (
    localization !== undefined &&
    localization.locales.some((declared) =>
      Object.hasOwn(translations, declared),
    )
  ) {
    const resolved = resolveLocalizedString(
      translations,
      localization,
      locale ?? localization.defaultLocale,
    );
    return {
      text: messageText(resolved.text),
      lang: resolved.locale,
      dir: localeDirection(resolved.locale),
    };
  }

  const [first] = Object.values(translations);
  return first === undefined ? NO_TRANSLATION : { text: messageText(first) };
}
