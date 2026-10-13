import type { LocaleTag } from '@codaco/protocol-validation';
import {
  hasDuplicateOptionLabels,
  normalizeCodebookName,
} from '@codaco/shared-consts';

import {
  asLocalizedString,
  type ProtocolLocalization,
  resolveTranslation,
  translationText,
} from '../../localization/localizedText.ts';

const readLabel = (option: unknown) =>
  typeof option === 'object' && option !== null
    ? Reflect.get(option, 'label')
    : undefined;

/**
 * What counts as a missing half of an option, shared by the row that shows the
 * gap and the array rule that refuses to save it. One definition, so the two
 * can never disagree about which option is finished.
 *
 * The other thing that can be wrong with a list of options — two of them a
 * participant would read the same way — is `hasDuplicateLocalizedOptionLabels`
 * below.
 *
 * A label is missing when it has no written translation in any language. One
 * written in some of the protocol's languages and not others is a gap to
 * translate, which the interview falls back over, not an empty label.
 */
export const isOptionLabelEmpty = (label: unknown) => {
  const translations = asLocalizedString(label);
  return (
    translations === undefined ||
    Object.keys(translations).every(
      (locale) => translationText(translations, locale).trim() === '',
    )
  );
};

// A value of nothing but spaces is empty: it is saved trimmed.
export const isOptionValueEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && normalizeCodebookName(value) === '');

export const isOptionComplete = (option: unknown) => {
  if (!option || typeof option !== 'object') return false;

  const label = 'label' in option ? option.label : undefined;
  const value = 'value' in option ? option.value : undefined;

  return !isOptionLabelEmpty(label) && !isOptionValueEmpty(value);
};

/** Every language at least one of `options` has a label in. */
const optionLabelLocales = (options: readonly unknown[]): LocaleTag[] => [
  ...new Set(
    options.flatMap((option) =>
      Object.keys(asLocalizedString(readLabel(option)) ?? {}),
    ),
  ),
];

/**
 * The languages labels are compared in: the protocol's own when known, else
 * every language a label is written in.
 */
export const optionLabelComparisonLocales = (
  options: readonly unknown[],
  localization: ProtocolLocalization | undefined,
): readonly LocaleTag[] =>
  localization === undefined
    ? optionLabelLocales(options)
    : localization.locales;

/**
 * A label's text as a participant reading `locale` sees it. Given the
 * protocol's languages, that is the translation the interview falls back to
 * where the label has none in `locale` (`resolveTranslation`), so an option
 * left untranslated is compared with what it shows rather than with nothing.
 * Without them, only the label's own translation in `locale`, or `''`.
 */
export const optionLabelTextIn = (
  label: unknown,
  locale: LocaleTag,
  localization: ProtocolLocalization | undefined,
): string =>
  localization === undefined
    ? translationText(label, locale)
    : resolveTranslation(label, localization, locale).text;

/**
 * `options` with each label replaced by its plain text in `locale`
 * (`optionLabelTextIn`): the shape shared-consts' label rules compare.
 */
export const optionsWithLabelText = (
  options: readonly unknown[],
  locale: LocaleTag,
  localization?: ProtocolLocalization,
) =>
  options.map((option) => ({
    label: optionLabelTextIn(readLabel(option), locale, localization),
  }));

/**
 * Whether two options read the same way to a participant in any one language.
 *
 * Each language is its own question, asked of shared-consts'
 * `hasDuplicateOptionLabels` so case and Unicode canonical equivalence are
 * settled the way every other label rule settles them. Given the protocol's
 * languages, each label is read as the interview shows it there, falling back
 * where it has no translation, so one option translated to the text another
 * falls back to is caught. Without them, an option with no translation in a
 * language has nothing to collide with there.
 */
export const hasDuplicateLocalizedOptionLabels = (
  options: unknown,
  localization?: ProtocolLocalization,
): boolean => {
  const rows: readonly unknown[] = Array.isArray(options) ? options : [];
  return optionLabelComparisonLocales(rows, localization).some((locale) =>
    hasDuplicateOptionLabels(optionsWithLabelText(rows, locale, localization)),
  );
};
