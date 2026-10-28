import { familyPedigreeWordingIn } from '@codaco/protocol-validation';

import { createLocalizedMessageFormatter } from '../../../localization/messageFormatter';
import { localizedMessageParts } from '../../../localization/ProtocolLocalizationProvider';
import { pedigreePipedFrom, type PedigreeWords } from '../pedigreeWords';

/**
 * The Family Pedigree's words in `locale`, as Network Canvas supplies them
 * there, formatted for that locale.
 */
export const pedigreeWordsIn = (locale = 'en'): PedigreeWords => {
  const format = createLocalizedMessageFormatter();
  return {
    wording: familyPedigreeWordingIn([locale]),
    text: (value, values) => format(locale, value[locale] ?? '', values),
    piped: pedigreePipedFrom((value, values) =>
      localizedMessageParts(value[locale] ?? '', locale, values),
    ),
    locale,
  };
};

/**
 * Finds a sentence of the stage's words as shown, whose values are each in
 * an element of their own (`showPiped`): the innermost element whose text is
 * the whole sentence.
 */
export const shownSentence =
  (sentence: string | RegExp) => (_: string, element: Element | null) => {
    const matches = (node: Element) =>
      typeof sentence === 'string'
        ? node.textContent === sentence
        : sentence.test(node.textContent);
    return (
      element !== null &&
      matches(element) &&
      ![...element.children].some((child) => matches(child))
    );
  };
