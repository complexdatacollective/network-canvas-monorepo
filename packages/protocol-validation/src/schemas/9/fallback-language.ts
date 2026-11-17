import type {
  LocaleTag,
  LocalizationDeclaration,
} from '../../localization/localeTag.ts';
import { hasSuppliedWording, SUPPLIED_LANGUAGES } from './supplied-text.ts';

/**
 * A protocol's fallback language is the language the interview shows its own
 * text in when it has that text in none of the languages a participant would
 * otherwise be shown: text a correction adds to the interview within a schema
 * version, which no protocol of that version can hold. One rule decides
 * whether a protocol has one:
 *
 * - A protocol whose default language Network Canvas has wording in
 *   (`hasSuppliedWording`) has none, and may not name one: every text falls
 *   back to the default language, and Network Canvas has that text in it.
 * - Any other protocol names exactly one, and it is one of the languages
 *   Network Canvas has wording in (`SUPPLIED_LANGUAGES`). It need not be a
 *   language the protocol declares: nothing the protocol holds is read in it.
 *
 * The schema refuses a fallback language that breaks either half. A protocol
 * being written may still lack the one it needs; a protocol handed over may
 * not (`findMissingFallbackLanguage`, and `releaseIssues`).
 */
export const needsFallbackLanguage = (defaultLocale: LocaleTag): boolean =>
  !hasSuppliedWording(defaultLocale);

/** Whether `locale` is a language a protocol may name as its fallback. */
export const isFallbackLanguageChoice = (locale: LocaleTag): boolean =>
  SUPPLIED_LANGUAGES.includes(locale);

export type FallbackLanguageProblem =
  /** The protocol's default language already serves, so none may be named. */
  | 'not-needed'
  /** Not a language Network Canvas has its own wording in. */
  | 'not-supplied';

/**
 * Why the fallback language a declaration names is one it may not name, or
 * `undefined` when it names none or may name it.
 */
export const findFallbackLanguageProblem = ({
  defaultLocale,
  fallbackLocale,
}: Pick<LocalizationDeclaration, 'defaultLocale' | 'fallbackLocale'>):
  | FallbackLanguageProblem
  | undefined => {
  if (fallbackLocale === undefined) return undefined;
  if (!needsFallbackLanguage(defaultLocale)) return 'not-needed';
  return isFallbackLanguageChoice(fallbackLocale) ? undefined : 'not-supplied';
};

/**
 * The default language of a declaration that needs a fallback language and
 * names none, or `undefined` when it needs none or names one. Something only
 * a protocol being written may lack.
 */
export const findMissingFallbackLanguage = ({
  defaultLocale,
  fallbackLocale,
}: Pick<LocalizationDeclaration, 'defaultLocale' | 'fallbackLocale'>):
  | LocaleTag
  | undefined =>
  fallbackLocale === undefined && needsFallbackLanguage(defaultLocale)
    ? defaultLocale
    : undefined;

/**
 * `localization` naming `fallbackLocale` as its fallback language where its
 * default language needs one, and naming none where it does not or where
 * `fallbackLocale` is `undefined`. What a tool that changes a protocol's
 * languages writes, passing the fallback language the protocol had: the
 * researcher's choice is kept while it still applies, and goes when a
 * language Network Canvas has wording in becomes the default.
 */
export const withFallbackLanguage = <
  Declaration extends LocalizationDeclaration,
>(
  localization: Declaration,
  fallbackLocale: LocaleTag | undefined,
): Omit<Declaration, 'fallbackLocale'> & { fallbackLocale?: LocaleTag } => {
  const { fallbackLocale: _previous, ...declared } = localization;
  return fallbackLocale !== undefined &&
    needsFallbackLanguage(declared.defaultLocale)
    ? { ...declared, fallbackLocale }
    : declared;
};
