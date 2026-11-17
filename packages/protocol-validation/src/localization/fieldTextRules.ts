import type { LocalizedString } from '../schemas/9/localized-string.ts';
import { wordingPresent } from '../schemas/9/protocol-wording.ts';
import type { CurrentProtocol } from '../schemas/index.ts';
import { findLabelCollisions } from './labelCollisions.ts';
import type { LocaleTag } from './localeTag.ts';

/**
 * The rules some participant-facing texts are held to beyond their own
 * declaration: rules that compare a text with its neighbours, or that the
 * editors apply while a protocol is being written. Each is defined once, and
 * every place a researcher can edit the text asks it: the stage or codebook
 * editor that owns the text, and Architect's translation table, which reads
 * them all through `findFieldTextProblems`.
 *
 * None refuses a protocol being written. Two labels that read the same
 * (`findLabelCollisions`) are refused of a protocol handed over, and the
 * editors refuse to write one; the interview text's default language is
 * required of a protocol handed over only where neither the protocol nor
 * Network Canvas's own wording has it.
 */

/** A rule in this module, as `findFieldTextProblems` names it. */
export type FieldTextRule =
  /** Two diseases a participant would read the same way. */
  | 'duplicateDiseaseLabel'
  /** Two options of one attribute a participant would read the same way. */
  | 'duplicateOptionLabel'
  /**
   * Interview text the interview shows with no words in the protocol's
   * default language, counting Network Canvas's own wording.
   */
  | 'interfaceTextWithoutDefaultLanguage';

export type FieldTextProblem = Readonly<{
  rule: FieldTextRule;
  /** The text's path in the protocol, as `collectLocalizedStrings` gives it. */
  path: readonly (string | number)[];
  /** The language a participant reads the problem in. */
  locale: LocaleTag;
}>;

const isLocalizedString = (value: unknown): value is LocalizedString =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((text) => typeof text === 'string');

/**
 * Whether a text has no words in the protocol's default language. Every text
 * the interview shows needs them, so the interview's own words always have a
 * text to fall back to; the schema allows a protocol being written to lack
 * them, and requires them only of one leaving its editor (see
 * `findBuiltInWordingProblems`).
 */
export const lacksDefaultLanguageText = (
  value: LocalizedString,
  defaultLocale: LocaleTag,
): boolean => (value[defaultLocale] ?? '').trim() === '';

/**
 * Every place a protocol breaks one of the rules in this module, by the text
 * and the language. Both texts of a pair that read the same are named, so a
 * place editing either can say so.
 */
export const findFieldTextProblems = (
  protocol: CurrentProtocol,
): FieldTextProblem[] => {
  const { localization } = protocol;
  const problems: FieldTextProblem[] = findLabelCollisions(protocol).flatMap(
    (collision) =>
      collision.paths.map((path) => ({
        rule:
          collision.kind === 'option'
            ? ('duplicateOptionLabel' as const)
            : ('duplicateDiseaseLabel' as const),
        path,
        locale: collision.duplicate.locale,
      })),
  );

  for (const [group, entries] of Object.entries(protocol.interfaceText ?? {})) {
    for (const [key, value] of Object.entries(entries ?? {})) {
      // What the interview shows is the protocol's text over Network
      // Canvas's own, so text held only in another language lacks nothing
      // where Network Canvas has wording in the default language.
      const shown = isLocalizedString(value)
        ? (wordingPresent.interfaceTextShown(
            protocol.interfaceText,
            group,
            key,
            localization,
          ) ?? value)
        : undefined;
      if (
        shown !== undefined &&
        lacksDefaultLanguageText(shown, localization.defaultLocale)
      ) {
        problems.push({
          rule: 'interfaceTextWithoutDefaultLanguage',
          path: ['interfaceText', group, key],
          locale: localization.defaultLocale,
        });
      }
    }
  }

  return problems;
};
