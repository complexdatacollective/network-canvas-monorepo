import { withTranslation as withBuilderTranslation } from '@codaco/protocol-builder/localization/localizedText';
import {
  type CurrentProtocol,
  type LocaleTag,
  type LocalizedString,
  messageText,
  resolveLocalizedString,
} from '@codaco/protocol-validation';

export type ProtocolLocalization = CurrentProtocol['localization'];

export type ResolvedText = {
  text: string;
  /** The translation the text came from, for its `lang` and `dir`. */
  locale: LocaleTag;
};

const hasDeclaredTranslation = (
  value: LocalizedString,
  localization: ProtocolLocalization,
) => localization.locales.some((locale) => Object.hasOwn(value, locale));

/**
 * The plain text a participant who selected `locale` would see, with the
 * interview's fallback, when their browser lists no other protocol language.
 * `locale` defaults to the protocol's default language.
 *
 * Unlike the runtime resolver this does not throw on a string with no declared
 * translation: Architect shows drafts that validation has not seen yet, and
 * such a string reads as absent.
 */
export const resolveLocalizedText = (
  value: LocalizedString | undefined,
  localization: ProtocolLocalization | undefined,
  locale?: LocaleTag,
): ResolvedText | null => {
  if (
    value === undefined ||
    localization === undefined ||
    !hasDeclaredTranslation(value, localization)
  ) {
    return null;
  }
  const resolved = resolveLocalizedString(value, localization, [
    locale ?? localization.defaultLocale,
  ]);
  return { text: messageText(resolved.text), locale: resolved.locale };
};

export const localizedText = (
  value: LocalizedString | undefined,
  localization: ProtocolLocalization | undefined,
  locale?: LocaleTag,
): string => resolveLocalizedText(value, localization, locale)?.text ?? '';

/**
 * The plain text stored for exactly `locale`, without fallback: what an editor
 * for that translation shows.
 */
export const translationText = (
  value: LocalizedString | undefined,
  locale: LocaleTag,
): string => {
  const message =
    value && Object.hasOwn(value, locale) ? value[locale] : undefined;
  return message === undefined ? '' : messageText(message);
};

/**
 * `value` with the translation for `locale` replaced by `text`, keeping every
 * other translation. Blank text — empty, or only whitespace — removes that
 * translation, so the language reads as missing rather than as text a
 * participant would see as nothing. The protocol builder's helper decides
 * that, so Architect and the package editors agree; a string left with no
 * translation is `{}` here, where the builder's is absent.
 */
export const withTranslation = (
  value: LocalizedString | undefined,
  locale: LocaleTag,
  text: string,
): LocalizedString => withBuilderTranslation(value, locale, text) ?? {};
