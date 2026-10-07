import type { LocaleTag } from '@codaco/protocol-validation';
import {
  hasDuplicateOptionLabels,
  normalizeCodebookName,
} from '@codaco/shared-consts';

import {
  asLocalizedString,
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
 * `options` with each label replaced by its plain text in `locale`, or `''`
 * where it has no translation there: the shape shared-consts' label rules
 * compare.
 */
export const optionsWithLabelText = (
  options: readonly unknown[],
  locale: LocaleTag,
) =>
  options.map((option) => ({
    label: translationText(readLabel(option), locale),
  }));

/**
 * Whether two options read the same way to a participant in any one language.
 *
 * Each language is its own question, asked of shared-consts'
 * `hasDuplicateOptionLabels` so case and Unicode canonical equivalence are
 * settled the way every other label rule settles them. An option with no
 * translation in a language has nothing to collide with there: two options
 * that both fall back to their default-language labels are already compared in
 * that language.
 */
export const hasDuplicateLocalizedOptionLabels = (
  options: unknown,
): boolean => {
  const rows: readonly unknown[] = Array.isArray(options) ? options : [];
  return optionLabelLocales(rows).some((locale) =>
    hasDuplicateOptionLabels(optionsWithLabelText(rows, locale)),
  );
};
