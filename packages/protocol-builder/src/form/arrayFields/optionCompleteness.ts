import { findDuplicateOptionLabels } from '@codaco/protocol-validation';
import { normalizeCodebookName } from '@codaco/shared-consts';

import {
  asLocalizedString,
  type ProtocolLocalization,
  translationText,
} from '../../localization/localizedText.ts';

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

/**
 * Whether two options read the same way to a participant in any one language:
 * the rule `@codaco/protocol-validation`'s `findDuplicateOptionLabels` defines
 * for every place an option label is edited, Architect's translation table
 * included. Given the protocol's languages, each label is read as the
 * interview shows it there, falling back where it has no translation.
 */
export const hasDuplicateLocalizedOptionLabels = (
  options: unknown,
  localization?: ProtocolLocalization,
): boolean => findDuplicateOptionLabels(options, localization).length > 0;
