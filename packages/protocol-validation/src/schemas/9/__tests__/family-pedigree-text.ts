import {
  CHILDREN_ITEM,
  CHILDREN_NONE,
  CHILDREN_QUESTION,
  DETAILS_ITEM,
  NAME_HINT,
  NAME_PROMPT,
  PARENTS_ITEM,
  RECOMMENDED_NOTE,
  SIBLINGS_ITEM,
  SIBLINGS_NONE,
  SIBLINGS_QUESTION,
} from '../family-pedigree-wording.ts';

/**
 * The text a Family Pedigree stage's name question holds, in English under
 * `locale`: what a fixture needs for the stage to be valid, without spelling
 * the supplied wording out again.
 */
export const pedigreeNameField = (locale = 'en') => ({
  prompt: { [locale]: NAME_PROMPT.en },
  hint: { [locale]: NAME_HINT.en },
});

/**
 * The text a Family Pedigree stage's `completeness` holds beside its
 * settings, in English under `locale`.
 */
export const pedigreeCompletenessText = (locale = 'en') => ({
  itemText: {
    parents: { listItem: { [locale]: PARENTS_ITEM.en } },
    siblings: {
      listItem: { [locale]: SIBLINGS_ITEM.en },
      noneButton: { [locale]: SIBLINGS_NONE.en },
      question: { [locale]: SIBLINGS_QUESTION.en },
    },
    children: {
      listItem: { [locale]: CHILDREN_ITEM.en },
      noneButton: { [locale]: CHILDREN_NONE.en },
      question: { [locale]: CHILDREN_QUESTION.en },
    },
    details: { listItem: { [locale]: DETAILS_ITEM.en } },
  },
  recommendedNote: { [locale]: RECOMMENDED_NOTE.en },
});
