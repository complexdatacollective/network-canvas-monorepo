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
import type {
  SuppliedStageSetting,
  SuppliedWording,
} from '../supplied-stage-setting.ts';

const pedigreeCompleteness = (
  path: readonly string[],
  message: SuppliedWording,
): SuppliedStageSetting => ({
  path: ['completeness', ...path],
  message,
  within: ['completeness'],
});

/** The Family Pedigree's settings Network Canvas words. */
export const FAMILY_PEDIGREE_SUPPLIED_TEXT: readonly SuppliedStageSetting[] = [
  {
    path: ['nodeConfiguration', 'nameField', 'prompt'],
    message: NAME_PROMPT,
  },
  {
    path: ['nodeConfiguration', 'nameField', 'hint'],
    message: NAME_HINT,
    optional: true,
  },
  pedigreeCompleteness(['itemText', 'parents', 'listItem'], PARENTS_ITEM),
  pedigreeCompleteness(['itemText', 'siblings', 'listItem'], SIBLINGS_ITEM),
  pedigreeCompleteness(['itemText', 'siblings', 'noneButton'], SIBLINGS_NONE),
  pedigreeCompleteness(['itemText', 'siblings', 'question'], SIBLINGS_QUESTION),
  pedigreeCompleteness(['itemText', 'children', 'listItem'], CHILDREN_ITEM),
  pedigreeCompleteness(['itemText', 'children', 'noneButton'], CHILDREN_NONE),
  pedigreeCompleteness(['itemText', 'children', 'question'], CHILDREN_QUESTION),
  pedigreeCompleteness(['itemText', 'details', 'listItem'], DETAILS_ITEM),
  pedigreeCompleteness(['recommendedNote'], RECOMMENDED_NOTE),
];
