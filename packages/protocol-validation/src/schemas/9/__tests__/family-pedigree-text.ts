import { englishWording } from '../../../__tests__/suppliedWording.ts';

/** Network Canvas's English for one of the Family Pedigree's settings. */
const pedigreeText = (setting: string): string =>
  englishWording(`interview.stageWording.familyPedigree.${setting}`);

/**
 * The text a Family Pedigree stage's name question holds, in English under
 * `locale`: what a fixture needs for the stage to be valid, without spelling
 * the supplied wording out again.
 */
export const pedigreeNameField = (locale = 'en') => ({
  prompt: { [locale]: pedigreeText('nodeConfiguration.nameField.prompt') },
  hint: { [locale]: pedigreeText('nodeConfiguration.nameField.hint') },
});

/**
 * The text a Family Pedigree stage's `completeness` holds beside its
 * settings, in English under `locale`.
 */
export const pedigreeCompletenessText = (locale = 'en') => ({
  itemText: {
    parents: {
      listItem: {
        [locale]: pedigreeText('completeness.itemText.parents.listItem'),
      },
    },
    siblings: {
      listItem: {
        [locale]: pedigreeText('completeness.itemText.siblings.listItem'),
      },
      noneButton: {
        [locale]: pedigreeText('completeness.itemText.siblings.noneButton'),
      },
      question: {
        [locale]: pedigreeText('completeness.itemText.siblings.question'),
      },
    },
    children: {
      listItem: {
        [locale]: pedigreeText('completeness.itemText.children.listItem'),
      },
      noneButton: {
        [locale]: pedigreeText('completeness.itemText.children.noneButton'),
      },
      question: {
        [locale]: pedigreeText('completeness.itemText.children.question'),
      },
    },
    details: {
      listItem: {
        [locale]: pedigreeText('completeness.itemText.details.listItem'),
      },
    },
  },
  recommendedNote: { [locale]: pedigreeText('completeness.recommendedNote') },
});
