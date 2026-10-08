import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import {
  PEDIGREE_GENDER_WORDS,
  type PedigreeGenderWords,
  type VariableOption,
} from '@codaco/protocol-validation';

import type {
  OptionRowChoice,
  OptionRowChoiceValue,
} from '../../../codebook/optionRowChoice.ts';
import { familyPedigreeMessages as messages } from './pedigreeMessages.ts';

/** One entry of a stage's mapping, as the stage stores it. */
export type GenderTerm = Readonly<{
  value: VariableOption['value'];
  words: PedigreeGenderWords;
}>;

/** What each kind of kinship words is called, in the order they are offered. */
export const GENDER_WORDS_LABELS: Readonly<
  Record<PedigreeGenderWords, MessageDescriptor>
> = {
  feminine: messages.genderWordsFeminine,
  masculine: messages.genderWordsMasculine,
  neutral: messages.genderWordsNeutral,
  unknown: messages.genderWordsUnknown,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isGenderWords = (value: unknown): value is PedigreeGenderWords =>
  PEDIGREE_GENDER_WORDS.some((words) => words === value);

/**
 * The words an option takes in a stored mapping: what it is mapped to, else
 * neutral words — what the interview gives an option the stage names no words
 * for.
 */
export const wordsFor = (
  terms: unknown,
  optionValue: VariableOption['value'],
): PedigreeGenderWords => {
  if (!Array.isArray(terms)) return 'neutral';
  for (const term of terms as unknown[]) {
    if (
      isRecord(term) &&
      term.value === optionValue &&
      isGenderWords(term.words)
    ) {
      return term.words;
    }
  }
  return 'neutral';
};

/** Whether the mapping names a value the attribute no longer has. */
export const namesAnotherValue = (
  terms: unknown,
  options: readonly VariableOption[],
): boolean =>
  Array.isArray(terms) &&
  (terms as unknown[]).some(
    (term) =>
      !isRecord(term) || !options.some((option) => option.value === term.value),
  );

/**
 * The whole mapping for these options, each keeping the words `terms` gives
 * it. An entry for a value the options do not have is not carried over.
 */
export const termsForOptions = (
  terms: unknown,
  options: readonly VariableOption[],
): GenderTerm[] =>
  options.map((option) => ({
    value: option.value,
    words: wordsFor(terms, option.value),
  }));

/**
 * The mapping the options dialog saved: one entry per saved option, in its
 * order, with the words chosen on its row. A row holding anything but one of
 * the four kinds of words reads as neutral, which is what the dialog offers a
 * new option.
 */
export const termsFromRowChoices = (
  choices: readonly OptionRowChoiceValue[],
): GenderTerm[] =>
  choices.map(({ value, choice }) => ({
    value,
    words: isGenderWords(choice) ? choice : 'neutral',
  }));

/**
 * The kinship-words choice on every option row of the gender identity
 * attribute's editor. `initialWords` says what each option the editor opens
 * with takes; an option the researcher adds takes neutral words.
 */
export const genderWordsRowChoice = (
  intl: IntlShape,
  initialWords: (value: VariableOption['value']) => PedigreeGenderWords,
): OptionRowChoice => ({
  label: (index) =>
    intl.formatMessage(messages.genderWordsOptionField, { index }),
  choices: PEDIGREE_GENDER_WORDS.map((words) => ({
    value: words,
    label: intl.formatMessage(GENDER_WORDS_LABELS[words]),
  })),
  initialValue: (option) => initialWords(option.value),
  addedValue: 'neutral',
});
