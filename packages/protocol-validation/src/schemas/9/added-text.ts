import type {
  LocaleTag,
  LocalizationDeclaration,
} from '../../localization/localeTag.ts';
import { resolveLocalizedString } from '../../localization/resolveLocalizedString.ts';
import { suppliedTextFor } from './supplied-text.ts';

/**
 * Text a correction adds to the interview within a schema version is the
 * interview's own: no protocol of that version can hold it, so nothing a
 * researcher wrote is read for it, and it is shown in Network Canvas's
 * wording. One rule decides the language:
 *
 * - The languages are tried in the order protocol text is
 *   (`resolveLocalizedString`): the interview's language or the closest
 *   related language the protocol declares, then the participant's other
 *   languages, then the protocol's default language. The first of them
 *   Network Canvas has wording in is shown.
 * - When Network Canvas has wording in none of them, the text is shown in the
 *   protocol's fallback language (see `needsFallbackLanguage`). This takes
 *   the place of the last step protocol text has, which reads any declared
 *   language that has the text: a participant is not shown a language of the
 *   protocol that nothing says they read.
 */
export type ResolvedAddedText = Readonly<{
  text: string;
  /**
   * The language shown: the protocol language the wording was found for, or
   * the protocol's fallback language.
   */
  locale: LocaleTag;
  /**
   * Which step found the wording (see `ResolvedLocalizedString`), or
   * `fallback` when none did and the protocol's fallback language is shown.
   */
  matchedBy: 'selected' | 'requested' | 'default' | 'fallback';
}>;

/**
 * The wording shown for a text a correction added, to a participant reading
 * in `requestedLocales[0]`. `wording` is Network Canvas's wording for the
 * text, by the language it is written in.
 *
 * `undefined` when there is none to show: the protocol's default language is
 * one Network Canvas has no wording in and it names no fallback language,
 * which only a protocol still being written does.
 */
export const resolveAddedText = (
  wording: Readonly<Record<LocaleTag, string>>,
  localization: LocalizationDeclaration,
  requestedLocales: readonly [string, ...string[]],
): ResolvedAddedText | undefined => {
  const inProtocolLanguages = Object.fromEntries(
    localization.locales.flatMap((locale) => {
      const text = suppliedTextFor(wording, locale);
      return text === undefined ? [] : [[locale, text] as const];
    }),
  );
  if (Object.keys(inProtocolLanguages).length > 0) {
    const { text, locale, matchedBy } = resolveLocalizedString(
      inProtocolLanguages,
      localization,
      requestedLocales,
    );
    if (matchedBy !== 'any') return { text, locale, matchedBy };
  }

  const { fallbackLocale } = localization;
  if (fallbackLocale === undefined) return undefined;
  const text = suppliedTextFor(wording, fallbackLocale);
  return text === undefined
    ? undefined
    : { text, locale: fallbackLocale, matchedBy: 'fallback' };
};
