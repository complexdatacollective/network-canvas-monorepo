import { match } from '@formatjs/intl-localematcher';

import {
  canonicalizeLocale,
  type LocaleTag,
  type LocalizationDeclaration,
} from './localeTag.ts';

type LocaleKeyedText = Readonly<Record<LocaleTag, string>>;

export type ResolvedLocalizedString = Readonly<{
  text: string;
  locale: LocaleTag;
  selectedLocale: LocaleTag;
  usedFallback: boolean;
  usedDefaultLocale: boolean;
}>;

export function resolveLocalizedString(
  value: LocaleKeyedText,
  localization: LocalizationDeclaration,
  selectedLocale: string,
): ResolvedLocalizedString {
  // Declaration order, not object key order, is the fallback priority.
  const available = localization.locales.flatMap((locale) => {
    const text = Object.hasOwn(value, locale) ? value[locale] : undefined;
    return text === undefined ? [] : [{ locale, text }];
  });

  const fallback =
    available.find(({ locale }) => locale === localization.defaultLocale) ??
    available[0];
  if (fallback === undefined) {
    throw new Error(
      `resolveLocalizedString: the value has no translation for any declared locale (${localization.locales.join(', ')}). Validate the protocol before resolving its strings.`,
    );
  }

  const selected = canonicalizeLocale(selectedLocale);
  const matched =
    selected === undefined
      ? fallback.locale
      : match(
          [selected],
          available.map(({ locale }) => locale),
          fallback.locale,
          { algorithm: 'best fit' },
        );
  const resolved =
    available.find(({ locale }) => locale === matched) ?? fallback;

  const requested = selected ?? selectedLocale;
  const usedFallback = resolved.locale !== requested;

  return {
    text: resolved.text,
    locale: resolved.locale,
    selectedLocale: requested,
    usedFallback,
    usedDefaultLocale:
      usedFallback && resolved.locale === localization.defaultLocale,
  };
}
