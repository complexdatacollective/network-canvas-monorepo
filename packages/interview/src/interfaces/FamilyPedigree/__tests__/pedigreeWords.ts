import {
  type FamilyPedigreeWording,
  familyPedigreeWordingIn,
} from '@codaco/protocol-validation';

import { createLocalizedMessageFormatter } from '../../../localization/messageFormatter';
import type { PedigreeWords } from '../pedigreeWords';

/**
 * The Family Pedigree's words in `locale`, as Network Canvas supplies them
 * there, formatted for that locale.
 */
export const pedigreeWordsIn = (locale = 'en'): PedigreeWords => {
  const format = createLocalizedMessageFormatter();
  return {
    wording: familyPedigreeWordingIn([locale]) as FamilyPedigreeWording,
    text: (value, values) => format(locale, value[locale] ?? '', values),
  };
};
