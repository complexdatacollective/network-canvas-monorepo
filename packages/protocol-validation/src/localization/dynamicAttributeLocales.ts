import type { DynamicValueName } from '../schemas/9/dynamic-value-names.ts';
import { dynamicValueNamesIn } from './dynamicValueMessages.ts';
import { localesPlacingFieldText } from './formFieldLocales.ts';
import type { LocaleTag } from './localeTag.ts';
import { resolveLocalizedString } from './resolveLocalizedString.ts';

type Localization = Readonly<{
  defaultLocale: LocaleTag;
  locales: readonly LocaleTag[];
}>;

/**
 * The languages in which a dynamic attribute is shown: those in which a text
 * of its owner (its stage, or its node label) names it, as a participant
 * reading that language sees the text. Where a text has no translation in a
 * language, that language is shown the translation the interview falls back
 * to (`resolveLocalizedString`). A form field's question or hint is shown
 * only in the languages whose form document places the field
 * (`localesPlacingFieldText`). `name` is the dynamic attribute's name in a
 * message (`dynamicValueNameFor`); each text's `path` is from the root of
 * `protocol`.
 *
 * A language in which no text shows the dynamic attribute needs no wording
 * for it: each language's text may use dynamic attributes that the others do
 * not.
 */
export const localesShowingDynamicAttribute = (
  name: DynamicValueName,
  texts: readonly Readonly<{
    path: readonly (string | number)[];
    value: Readonly<Record<string, unknown>>;
  }>[],
  protocol: unknown,
  localization: Localization,
): readonly LocaleTag[] => {
  const translated = texts.flatMap(({ path, value }) => {
    const messages: Record<LocaleTag, string> = {};
    for (const locale of localization.locales) {
      const message = value[locale];
      if (typeof message === 'string') messages[locale] = message;
    }
    if (Object.keys(messages).length === 0) return [];
    const shownIn =
      localesPlacingFieldText(path, protocol, localization) ??
      localization.locales;
    return [{ messages, shownIn }];
  });
  return localization.locales.filter((locale) =>
    translated.some(
      ({ messages, shownIn }) =>
        shownIn.includes(locale) &&
        dynamicValueNamesIn(
          resolveLocalizedString(messages, localization, [locale]).text,
        ).includes(name),
    ),
  );
};
