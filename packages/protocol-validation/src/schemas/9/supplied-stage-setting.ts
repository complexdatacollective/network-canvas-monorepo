import {
  canonicalizeLocale,
  type LocaleTag,
} from '../../localization/localeTag.ts';
import { suppliedLanguageOf } from './supplied-text.ts';

/**
 * A text Network Canvas words: an interface text, or a stage setting. The
 * schema names the text and the interview holds its words, as one of its own
 * messages in each language Network Canvas supplies
 * (`packages/interview/src/locales/wording`). A protocol holds the text only where
 * its author reworded it.
 */
export type SuppliedText = Readonly<{
  /**
   * The interview message whose text, in each language Network Canvas
   * supplies, is its wording for this text.
   */
  wording: string;
  /**
   * The regional variants of a supplied language the text is also worded in:
   * British English, where the American wording spells a word differently.
   * A protocol in a variant not listed here holds the text itself, or has the
   * supplied language added beside it (`suppliedBaseLanguage`).
   */
  variants?: readonly LocaleTag[];
}>;

/**
 * Network Canvas's wording as the interview holds it: for each language, the
 * text of each of its messages, by message id.
 */
export type SuppliedWordingCatalogues = Readonly<
  Record<LocaleTag, Readonly<Record<string, string>>>
>;

/**
 * Network Canvas's wording for a text in a protocol language, or `undefined`
 * where it has none there.
 */
export type SuppliedWordingSource = (
  text: SuppliedText,
  locale: LocaleTag,
) => string | undefined;

/**
 * The language of Network Canvas's wording a protocol language reads a text
 * in, or `undefined` when it has none: the supplied language the protocol
 * language is (`suppliedLanguageOf`), or the protocol language itself when
 * the text is also worded in that variant. Only the same language is read, so
 * neither Mexican Spanish nor Catalan is given another language's words, and
 * no language is given English in place of its own.
 */
const wordedIn = (
  text: SuppliedText,
  locale: LocaleTag,
): LocaleTag | undefined => {
  const canonical = canonicalizeLocale(locale);
  if (canonical === undefined) return undefined;
  if (text.variants?.includes(canonical) === true) return canonical;
  return suppliedLanguageOf(canonical);
};

/** The wording a set of catalogues holds (see `SuppliedWordingSource`). */
export const wordingFromCatalogues =
  (catalogues: SuppliedWordingCatalogues): SuppliedWordingSource =>
  (text, locale) => {
    const language = wordedIn(text, locale);
    if (language === undefined || !Object.hasOwn(catalogues, language)) {
      return undefined;
    }
    const catalogue = catalogues[language];
    return catalogue !== undefined && Object.hasOwn(catalogue, text.wording)
      ? catalogue[text.wording]
      : undefined;
  };

/**
 * What stands for Network Canvas's wording where only its presence matters.
 * A private-use character, so it is never blank and never reads the same as
 * text a researcher wrote.
 */
const PRESENT_WORDING = '\uE000';

/**
 * Where Network Canvas has wording, without the words: which languages it
 * words a text in is fixed by the schema version (`SUPPLIED_LANGUAGES` and
 * each text's `variants`), so validation can tell whether a text a protocol
 * omits has words in a language without holding any catalogue.
 */
export const wordingPresence: SuppliedWordingSource = (text, locale) =>
  wordedIn(text, locale) === undefined ? undefined : PRESENT_WORDING;

/** One stage setting whose wording Network Canvas supplies. */
export type SuppliedStageSetting = SuppliedText &
  Readonly<{
    /** Where the stage holds the setting. */
    path: readonly string[];
    /**
     * An optional object the setting belongs to: the interview shows the
     * setting only for a stage that has the object (the Family Pedigree's
     * completeness texts belong to `completeness`).
     */
    within?: readonly string[];
    /**
     * A setting the stage shows only while it is configured a certain way,
     * such as the Family Pedigree's wording question, asked only when
     * participants choose the wording. A stage holds wording for it only
     * while `when` holds: saving a stage drops it when the configuration is
     * switched off (see `stageWithoutSuppliedText`).
     */
    when?: (stage: Readonly<Record<string, unknown>>) => boolean;
  }>;
