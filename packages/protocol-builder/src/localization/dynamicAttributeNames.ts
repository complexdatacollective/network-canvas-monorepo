import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';
import {
  type Codebook,
  type DynamicAttribute,
  type DynamicAttributeVersion,
  type DynamicValueRole,
  type DynamicValueSiteContext,
  type LocaleTag,
  messageText,
} from '@codaco/protocol-validation';
import { isRecord, valueAtPath } from '@codaco/shared-consts';

import {
  asDynamicAttribute,
  dynamicAttributeVersionAt,
  dynamicAttributeWordings,
  namingFor,
} from '../fields/dynamicText/valueNaming.ts';
import {
  type VersionLabelSources,
  logicVersionLabel,
  versionLabelMessages,
} from '../fields/dynamicText/versionLabels.ts';
import { participantVersionMessages } from '../fields/messageArgumentLabels.ts';
import { dynamicAttributePillName } from '../fields/VariablePill.tsx';
import { asConditionDraft, conditionSentence } from './conditionText.ts';
import {
  asLocalizedString,
  type ProtocolLocalization,
  resolveStoredTranslation,
} from './localizedText.ts';
import { conditionVersionKey } from './messageDocument.ts';

export const dynamicAttributeNameMessages = defineMessages({
  dynamicAttribute: {
    id: 'protocolBuilder.localizedTextNames.dynamicAttribute',
    defaultMessage: 'Dynamic attribute',
    description:
      'Names a dynamic attribute that has no wording yet, where a text is listed without its translation. A dynamic attribute is a word or phrase that reads differently in different cases, such as “their”, “her” or “his”.',
  },
  versionPosition: {
    id: 'protocolBuilder.localizedTextNames.versionPosition',
    defaultMessage: 'Version {position, number}',
    description:
      'Names one version of a dynamic attribute, chosen by rules or by an answer, where its wording is listed without a translation. position is the version’s place among those versions, counting from one.',
  },
  numberWording: {
    id: 'protocolBuilder.localizedTextNames.numberWording',
    defaultMessage: 'Wording for singular or plural numbers',
    description:
      'Names the wording of a dynamic attribute that shows a number, which has a version for each plural form of the language, where it is listed without a translation.',
  },
});

type Path = readonly (string | number)[];

/**
 * A dynamic attribute's wordings as its pill shows them, in `locale` (or the
 * language that it falls back to), or `''` where it has none.
 */
export const dynamicAttributeWordingsName = (
  dynamicAttribute: DynamicAttribute | undefined,
  localization: ProtocolLocalization | undefined,
  locale: LocaleTag | undefined,
): string =>
  dynamicAttribute === undefined
    ? ''
    : dynamicAttributePillName(
        dynamicAttributeWordings(dynamicAttribute, (wording) =>
          resolveStoredTranslation(wording, localization, locale),
        ),
      );

/** The first text of a localized string, in whichever language has one. */
const firstText = (value: unknown): string => {
  const [first] = Object.values(asLocalizedString(value) ?? {});
  return first === undefined ? '' : messageText(first);
};

/** Text that names its values knows none here: names come from the codebook. */
const NO_SITE: DynamicValueSiteContext = {
  roles: new Set<DynamicValueRole>(),
  variablesFor: () => undefined,
};

/**
 * What a version of a dynamic attribute is named by, as the dynamic
 * attribute's settings label it: the rules of a case, read from the
 * `conditions` of its owner (the stage, or a node type's label), and an
 * answer by its option's label.
 */
const branchLabelSources = (
  intl: IntlShape,
  codebook: Codebook,
  conditions: unknown,
): VersionLabelSources => {
  const declared = (conditionId: string) =>
    isRecord(conditions) && Object.hasOwn(conditions, conditionId);
  return {
    intl,
    locale: intl.locale,
    naming: namingFor(intl, {
      context: NO_SITE,
      codebook,
      labelText: firstText,
    }),
    hasCondition: declared,
    conditionSentence: (conditionId) =>
      conditionSentence(
        asConditionDraft(
          declared(conditionId) && isRecord(conditions)
            ? conditions[conditionId]
            : undefined,
        ),
        { codebook, intl },
      ),
  };
};

/**
 * The label of `version` of `dynamicAttribute`, as the dynamic attribute's
 * settings show it: “If: Age is more than 30”, “Woman”, “Otherwise”,
 * “Someone else”.
 */
const versionLabelOf = (
  intl: IntlShape,
  sources: () => VersionLabelSources,
  dynamicAttribute: DynamicAttribute,
  version: DynamicAttributeVersion,
): string => {
  switch (version.role) {
    case 'condition': {
      const cases =
        dynamicAttribute.logic === 'conditions' ? dynamicAttribute.cases : [];
      const index = cases.findIndex((entry) => entry.condition === version.key);
      const entry = cases[index];
      if (entry === undefined) return byPosition(intl, index);
      return logicVersionLabel(
        sources(),
        { kind: 'conditions' },
        conditionVersionKey(entry.condition),
        { conditionId: entry.condition, when: entry.when },
        index,
      );
    }
    case 'answer':
      return dynamicAttribute.logic === 'answers'
        ? logicVersionLabel(
            sources(),
            { kind: 'answers', value: dynamicAttribute.value },
            version.key ?? '',
            undefined,
            0,
          )
        : byPosition(intl, 0);
    case 'otherwise':
      // “Someone else” for the participant's versions.
      return intl.formatMessage(
        dynamicAttribute.logic === 'participant'
          ? participantVersionMessages.aboutSomeoneElse
          : versionLabelMessages.otherwise,
      );
    case 'missing':
      return intl.formatMessage(versionLabelMessages.missing);
    case 'other':
      return intl.formatMessage(versionLabelMessages.otherAnswer);
    case 'participant':
      return intl.formatMessage(participantVersionMessages.aboutParticipant);
    case 'number':
    default:
      return intl.formatMessage(dynamicAttributeNameMessages.numberWording);
  }
};

/** “Version 2”: a version named by its place among the versions, from zero. */
const byPosition = (intl: IntlShape, index: number): string =>
  intl.formatMessage(dynamicAttributeNameMessages.versionPosition, {
    position: Math.max(index, 0) + 1,
  });

/**
 * The label of the version of `dynamicAttribute` whose wording is at
 * `versionPath`, as the dynamic attribute's settings show it: “If: Age is
 * more than 30”, “Woman”, “Otherwise”, “Someone else”. A case or an answer
 * that the definition does not have is named by its position.
 */
export const dynamicAttributeVersionLabel = (
  intl: IntlShape,
  {
    codebook,
    conditions,
    dynamicAttribute,
    versionPath,
  }: Readonly<{
    codebook: Codebook;
    /** The conditions of the dynamic attribute's owner. */
    conditions: unknown;
    dynamicAttribute: DynamicAttribute | undefined;
    versionPath: Path;
  }>,
): string => {
  const version =
    dynamicAttribute === undefined
      ? undefined
      : dynamicAttributeVersionAt(dynamicAttribute, versionPath);
  if (dynamicAttribute === undefined || version === undefined) {
    // An entry that the definition does not have: the number of its place
    // in the list of cases or answers.
    const [, position] = versionPath;
    return byPosition(intl, typeof position === 'number' ? position : 0);
  }
  return versionLabelOf(
    intl,
    () => branchLabelSources(intl, codebook, conditions),
    dynamicAttribute,
    version,
  );
};

/**
 * Where a dynamic attribute is declared: on a stage, or in the label of a
 * node type, whose definition `place` is then.
 */
export type DynamicAttributeOwner = Readonly<{
  kind: 'stage' | 'nodeLabel';
  /** The stage, or the node type's definition. */
  place: unknown;
  codebook: Codebook;
  localization: ProtocolLocalization | undefined;
  /** The language being edited, which the dynamic attribute is named in. */
  locale: LocaleTag | undefined;
}>;

/**
 * Where `owner` declares its dynamic attributes and conditions, from its place.
 */
const ownerPath = (owner: DynamicAttributeOwner): readonly string[] =>
  owner.kind === 'stage' ? [] : ['dynamicLabel'];

/** The definition of the dynamic attribute `id` of `owner`, read leniently. */
const ownedDynamicAttribute = (
  owner: DynamicAttributeOwner,
  id: string,
): DynamicAttribute | undefined =>
  asDynamicAttribute(
    valueAtPath(owner.place, [...ownerPath(owner), 'dynamicAttributes', id]),
  );

/** What a problem with a dynamic attribute names it by. */
type DynamicAttributeNaming = Readonly<{
  /**
   * Its wordings in the language being edited, as its pill shows them; `''`
   * where it has none.
   */
  name: string;
}> &
  (
    | Readonly<{ version?: undefined }>
    | Readonly<{
        /** The version that the problem is about, as its settings label it. */
        version: string;
        /** The path of that version's wording, from the definition. */
        versionPath: Path;
      }>
  );

/**
 * Names the dynamic attribute `id` of `owner` and, where `rest` (the path
 * from the definition) is inside one of its versions, that version: "their /
 * her / his" and "Woman". A path in a case's or an answer's entry outside its
 * wording, such as the condition that a case tests, names the case's version.
 * Undefined where the owner declares no such dynamic attribute.
 */
export function nameDynamicAttribute(
  intl: IntlShape,
  owner: DynamicAttributeOwner,
  id: string,
  rest: readonly PropertyKey[],
): DynamicAttributeNaming | undefined {
  const dynamicAttribute = ownedDynamicAttribute(owner, id);
  if (dynamicAttribute === undefined) return undefined;
  const name = dynamicAttributeWordingsName(
    dynamicAttribute,
    owner.localization,
    owner.locale,
  );
  const version = dynamicAttributeVersionAt(dynamicAttribute, rest);
  if (version === undefined) return { name };
  return {
    name,
    version: versionLabelOf(
      intl,
      () =>
        branchLabelSources(
          intl,
          owner.codebook,
          valueAtPath(owner.place, [...ownerPath(owner), 'conditions']),
        ),
      dynamicAttribute,
      version,
    ),
    versionPath: version.path,
  };
}
