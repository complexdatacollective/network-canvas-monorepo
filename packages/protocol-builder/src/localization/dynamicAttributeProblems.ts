import {
  createMessageError,
  defineMessages,
  type IntlShape,
} from '@codaco/app-i18n/messages';
import { valueAtPath } from '@codaco/shared-consts';

import {
  type DynamicAttributeOwner,
  nameDynamicAttribute,
} from './dynamicAttributeNames.ts';
import { asLocalizedString } from './localizedText.ts';

const dynamicAttributeProblemMessages = defineMessages({
  problem: {
    id: 'protocolBuilder.dynamicAttributeProblem.problem',
    defaultMessage: 'Dynamic attribute “{name}”: {problem}',
    description:
      'Shown in the list of problems of a stage, or under the label of a node type, when one of its dynamic attributes cannot be saved. name is the dynamic attribute as its pill in the text shows it: its versions joined by slashes, such as “their / her / his”. problem is a whole sentence saying what is wrong, such as “The rules that choose this version no longer exist.” A dynamic attribute is a word or phrase in a sentence that reads differently in different cases.',
  },
  versionProblem: {
    id: 'protocolBuilder.dynamicAttributeProblem.versionProblem',
    defaultMessage:
      'Dynamic attribute “{name}”, version “{version}”: {problem}',
    description:
      'Shown in the list of problems of a stage, or under the label of a node type, when one version of one of its dynamic attributes cannot be saved. name is the dynamic attribute as its pill in the text shows it: its versions joined by slashes, such as “their / her / his”. version is the label of the version, as the settings of the dynamic attribute show it, such as “Woman” or “Otherwise”. problem is a whole sentence saying what is wrong, such as “Write this version.” A dynamic attribute is a word or phrase in a sentence that reads differently in different cases.',
  },
  writeVersion: {
    id: 'protocolBuilder.dynamicAttribute.writeVersion',
    defaultMessage: 'Write this version.',
    description:
      'Problem shown under a version of a dynamic attribute that is empty in the language being edited, and in the list of problems of a stage or a node type label that has such a version.',
  },
});

/** Where `owner` declares its dynamic attributes, from its own place. */
const definitionsPath = (owner: DynamicAttributeOwner): readonly string[] =>
  owner.kind === 'stage'
    ? ['dynamicAttributes']
    : ['dynamicLabel', 'dynamicAttributes'];

/**
 * A problem at `at` (the path from the owner's dynamic attributes: the
 * dynamic attribute's id, then the path in its definition), named by the
 * dynamic attribute as its pill shows it in the language being edited and,
 * where it is about one version, by that version: nothing beside the text
 * answers for a dynamic attribute but its pills, so the problem has to say
 * which one it is about. Encoded, so that the sentence is read in the
 * language of the interface where it is shown; the version's label is read
 * in the language of `intl`.
 *
 * A version that has no wording in any language is asked to be written,
 * whatever words the schema used for it. Empty wording is not missing: that
 * version shows nothing. `problem` stands as it is
 * where the path names no dynamic attribute of the owner, or one that has no
 * wording yet.
 */
export function namedDynamicAttributeProblem(
  intl: IntlShape,
  owner: DynamicAttributeOwner,
  at: readonly PropertyKey[],
  problem: string,
): string {
  const [id, ...rest] = at;
  if (typeof id !== 'string') return problem;
  const naming = nameDynamicAttribute(intl, owner, id, rest);
  if (naming === undefined || naming.name === '') return problem;
  if (naming.version === undefined) {
    return createMessageError(dynamicAttributeProblemMessages.problem, {
      name: naming.name,
      // Plain words stand as they are; encoded words are read in the
      // language of the interface where the problem is shown.
      problem: { messageError: problem },
    });
  }
  return createMessageError(dynamicAttributeProblemMessages.versionProblem, {
    name: naming.name,
    version: naming.version,
    problem: isUnwritten(owner, id, naming.versionPath, rest)
      ? {
          messageError: createMessageError(
            dynamicAttributeProblemMessages.writeVersion,
          ),
        }
      : { messageError: problem },
  });
}

/**
 * Whether the problem at `rest` is about the wording of the version at
 * `versionPath` (in the definition `id`) as a whole, and the version has no
 * wording in any language. A problem about one language's wording keeps its
 * own words, which name the language.
 */
const isUnwritten = (
  owner: DynamicAttributeOwner,
  id: string,
  versionPath: readonly (string | number)[],
  rest: readonly PropertyKey[],
): boolean => {
  if (
    rest.length !== versionPath.length ||
    !versionPath.every((part, index) => rest[index] === part)
  ) {
    return false;
  }
  // Empty wording is written: the version shows nothing. `rest` is the
  // version's path, compared part by part above.
  const value = valueAtPath(owner.place, [
    ...definitionsPath(owner),
    id,
    ...versionPath,
  ]);
  return value === undefined || asLocalizedString(value) === undefined;
};
