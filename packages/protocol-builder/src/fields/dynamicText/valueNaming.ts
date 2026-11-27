import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';
import {
  type InterfaceLanguage,
  interfaceLanguage,
} from '@codaco/fresco-ui/interfaceLanguage';
import { optionLabelText } from '@codaco/fresco-ui/OptionLabel';
import {
  type PresentationalText,
  presentationalTextValue,
} from '@codaco/fresco-ui/PresentationalText';
import {
  type Codebook,
  type DynamicAttribute,
  type DynamicAttributeVersion,
  dynamicAttributeVersions,
  type DynamicValueRole,
  type DynamicValueSiteContext,
  FALSE_CASE,
  type LocaleTag,
  dynamicMessageParts,
  dynamicValueNamesIn,
  inlineMarkdownText,
  type MessagePart,
  NUMBER_WORDING_COUNT,
  optionIdFromCaseKey,
  type ParsedDynamicValuePath,
  parseDynamicValueName,
  pluralCountExamples,
  TRUE_CASE,
} from '@codaco/protocol-validation';
import { isRecord } from '@codaco/shared-consts';

import type { DynamicValueChoice } from '../../localization/dynamicValueCatalog.ts';
import {
  asLocalizedString,
  type StoredTranslation,
} from '../../localization/localizedText.ts';
import {
  dynamicAttributePillName,
  variablePillKindOf,
  type VariablePillProps,
} from '../VariablePill.tsx';

export const valueNamingMessages = defineMessages({
  today: {
    id: 'protocolBuilder.dynamicText.today',
    defaultMessage: 'Today’s date',
    description:
      'A value a researcher can insert into text a participant reads: the date on the day the participant reads it.',
  },
  firstNodeValue: {
    id: 'protocolBuilder.dynamicText.dyadSourceValue',
    defaultMessage: 'First node: {attribute}',
    description:
      'Name of an inserted value, as it appears in the text and in the insert-a-value menu: an attribute of the first of the two nodes a question asks about together, as a pair. attribute is the attribute’s name as the researcher wrote it, such as “nickname”. A node is one entity in the network, which may not be a person.',
  },
  secondNodeValue: {
    id: 'protocolBuilder.dynamicText.dyadTargetValue',
    defaultMessage: 'Second node: {attribute}',
    description:
      'Name of an inserted value, as it appears in the text and in the insert-a-value menu: an attribute of the second of the two nodes a question asks about together, as a pair. attribute is the attribute’s name as the researcher wrote it, such as “nickname”. A node is one entity in the network, which may not be a person.',
  },
  nodeLabel: {
    id: 'protocolBuilder.dynamicText.nodeLabel',
    defaultMessage: 'Node label',
    description:
      'Name of an inserted value, as it appears in the text and in the insert-a-value menu: the label the interview shows on a node, which it takes from the node’s name or another of its answers, or else from the node type’s name. A node is one entity in the network, which may not be a person.',
  },
  firstNodeLabel: {
    id: 'protocolBuilder.dynamicText.firstNodeLabel',
    defaultMessage: 'First node: label',
    description:
      'Name of an inserted value, as it appears in the text and in the insert-a-value menu, listed with the first node’s attributes such as “First node: nickname”: the label the interview shows on the first of two nodes the text is about, either the first node of a pair a question asks about together or the first of the two nodes an edge connects. The label is taken from the node’s name or another of its answers, or else from the node type’s name. A node is one entity in the network, which may not be a person; an edge is a connection between two nodes.',
  },
  secondNodeLabel: {
    id: 'protocolBuilder.dynamicText.secondNodeLabel',
    defaultMessage: 'Second node: label',
    description:
      'Name of an inserted value, as it appears in the text and in the insert-a-value menu, listed with the second node’s attributes such as “Second node: nickname”: the label the interview shows on the second of two nodes the text is about, either the second node of a pair a question asks about together or the second of the two nodes an edge connects. The label is taken from the node’s name or another of its answers, or else from the node type’s name. A node is one entity in the network, which may not be a person; an edge is a connection between two nodes.',
  },
  isParticipant: {
    id: 'protocolBuilder.dynamicText.isParticipant',
    defaultMessage: 'Participant or someone else',
    description:
      'Name of a value that a question on the Family Pedigree stage can choose its wording by: whether the family member the question is asked about is the participant themselves or someone else in their family. It chooses which version of the text is shown. It is never shown.',
  },
  defaultNodeLabel: {
    id: 'protocolBuilder.dynamicText.defaultNodeLabel',
    defaultMessage: 'Default label',
    description:
      'Name of an inserted value, as it appears in the text and in the insert-a-value menu of a node type’s own label: the label the interview would choose for the node if the node type had no label of its own, taken from the node’s name or another of its answers. A node is one entity in the network, which may not be a person.',
  },
  deletedAttribute: {
    id: 'protocolBuilder.dynamicText.deletedAttribute',
    defaultMessage: 'Deleted attribute',
    description:
      'Shown in place of a value in a piece of text that a participant reads, when the attribute that the value comes from has been deleted from the codebook. The researcher should remove the value or insert another one.',
  },
  showsNothing: {
    id: 'protocolBuilder.dynamicText.showsNothing',
    defaultMessage: 'Shows nothing',
    description:
      'Shown in the pill of a dynamic attribute whose versions are all empty, and as a muted hint inside an empty box for one version of a dynamic attribute. An empty version is allowed: nothing is shown in its place during the interview. A dynamic attribute is a word or phrase in a sentence that reads differently in different cases.',
  },
  deletedDynamicAttribute: {
    id: 'protocolBuilder.dynamicText.deletedDynamicAttribute',
    defaultMessage: 'Deleted dynamic attribute',
    description:
      'Shown in place of a dynamic attribute in a piece of text that a participant reads, when the dynamic attribute has been deleted from the stage. A dynamic attribute shows a short word or phrase that its logic chooses, such as “their”, “her” or “his”.',
  },
  deletedOption: {
    id: 'protocolBuilder.dynamicText.deletedOption',
    defaultMessage: 'Deleted option',
    description:
      'Label of a version of a piece of text that was written for one answer to an attribute, when that answer (one of the attribute’s options) has been deleted from the codebook.',
  },
  deletedCondition: {
    id: 'protocolBuilder.dynamicText.deletedCondition',
    defaultMessage: 'Deleted condition',
    description:
      'Shown in place of the rules of an “If” in a piece of text that a participant reads, when the rules that the “If” tests have been deleted from the stage.',
  },
  yes: {
    id: 'protocolBuilder.dynamicText.yes',
    defaultMessage: 'Yes',
    description:
      'Label of the version of a piece of text shown when a yes-or-no attribute is yes.',
  },
  no: {
    id: 'protocolBuilder.dynamicText.no',
    defaultMessage: 'No',
    description:
      'Label of the version of a piece of text shown when a yes-or-no attribute is no.',
  },
});

/**
 * The variable with the id `variableId`, wherever the codebook has it: on
 * the participant, or on a node or edge type. Variable ids are unique across
 * the codebook.
 */
const codebookVariable = (
  codebook: Readonly<Codebook> | undefined,
  variableId: string,
): Record<string, unknown> | undefined => {
  if (codebook === undefined) return undefined;
  const owners: unknown[] = [
    codebook.ego,
    ...Object.values(codebook.node ?? {}),
    ...Object.values(codebook.edge ?? {}),
  ];
  for (const owner of owners) {
    const variables = isRecord(owner) ? owner.variables : undefined;
    const variable = isRecord(variables) ? variables[variableId] : undefined;
    if (isRecord(variable)) return variable;
  }
  return undefined;
};

/** What the names in a text are looked up in. */
type NamingSources = Readonly<{
  context: DynamicValueSiteContext;
  codebook?: Readonly<Codebook> | undefined;
  /** The conditions declared beside the text, by id. */
  conditions?: Readonly<Record<string, unknown>> | undefined;
  /** The dynamic attributes declared beside the text, by id. */
  dynamicAttributes?: Readonly<Record<string, unknown>> | undefined;
  /** A translatable string in the language being read. */
  labelText?: (label: unknown) => string;
  /**
   * A dynamic attribute's wording in the language being read, as stored, with
   * its language. Without it, the first translation that the wording has.
   */
  wordingOf?: (wording: unknown) => StoredTranslation | undefined;
  /**
   * The interface's language and direction, which a pill named in the
   * interface's own words (“Today’s date”) is read in. Without it, pills
   * carry no language.
   */
  interfaceLanguage?: InterfaceLanguage;
}>;

export type ValueNaming = Readonly<{
  /** What a value that this place offers is called. */
  valueLabel: (choice: DynamicValueChoice) => PresentationalText;
  /**
   * What any name the text uses is called: an attribute by its name wherever
   * the codebook still has it, a deleted one as a deleted attribute, and a
   * dynamic attribute by its values.
   */
  recordedLabel: (name: string) => PresentationalText;
  /**
   * What an answer of the attribute that `argument` names is called, by its
   * case key: its option's label, "Yes" or "No", or a deleted option.
   * Undefined for a key that chooses no option.
   */
  answerLabel: (argument: string, key: string) => string | undefined;
  /** The attribute a value name refers to, at this place or in the codebook. */
  variableOf: (name: string) => Record<string, unknown> | undefined;
  /** The pill the editor draws for a value name. */
  pillFor: (name: string) => VariablePillProps;
}>;

/**
 * How a value that wording shows is written in a summary of it in words: by
 * what it is called, in square brackets, as in "[Name]’s doctor".
 */
export type WordingValueText = (name: string) => string;

/** Each value shown by its name alone, where nothing names it better. */
const valueNamed: WordingValueText = (name) => `[${name}]`;

/**
 * One version of wording, read as `dynamicMessageParts` gives it, as the
 * words it shows: its markdown without bold or italics, each value written
 * by `valueText`.
 */
const wordsOf = (
  parts: readonly MessagePart[],
  valueText: WordingValueText,
): string =>
  inlineMarkdownText(parts)
    .map((part) => (typeof part === 'string' ? part : valueText(part.argument)))
    .join('');

/** Every value present: a summary chooses no version by a value. */
const PRESENT = () => ({ missing: false }) as const;

/**
 * The wording of a version as it reads: its words, without bold or italics,
 * and each value it shows as `valueText` writes it.
 */
export const versionWordingText = (
  message: string,
  locale: LocaleTag,
  valueText: WordingValueText = valueNamed,
): string => wordsOf(dynamicMessageParts(message, locale, PRESENT), valueText);

/**
 * Number wording as it reads: each of its versions, in `locale`'s plural
 * forms, showing the first number it is for ("1 child", "2 children"), with
 * each other value as `valueText` writes it. Wording that does not change
 * with the number reads once.
 */
export const numberWordingExamples = (
  message: string,
  locale: LocaleTag,
  valueText: WordingValueText = valueNamed,
): string[] => {
  let format: (count: number) => string = String;
  try {
    const numbers = new Intl.NumberFormat(locale);
    format = (count) => numbers.format(count);
  } catch {
    // A tag that Intl does not know shows the number in plain digits.
  }
  if (!dynamicValueNamesIn(message).includes(NUMBER_WORDING_COUNT)) {
    return [versionWordingText(message, locale, valueText)];
  }
  return [...pluralCountExamples(locale)].flatMap(([, counts]) => {
    const count = counts[0];
    if (count === undefined) return [];
    const parts = dynamicMessageParts(message, locale, (name) =>
      name === NUMBER_WORDING_COUNT
        ? { missing: false, count }
        : { missing: false },
    );
    return [
      wordsOf(parts, (name) =>
        name === NUMBER_WORDING_COUNT ? format(count) : valueText(name),
      ),
    ];
  });
};

/** The first translation that `wording` has, with its language. */
const firstTranslation = (wording: unknown): StoredTranslation | undefined => {
  const [first] = Object.entries(asLocalizedString(wording) ?? {});
  return first === undefined
    ? undefined
    : { message: first[1], locale: first[0] };
};

/**
 * The wordings of a dynamic attribute in branch order, as `wordingOf` reads
 * each version (see `dynamicAttributeVersions`): number wording as each of
 * its plural versions with an example number, any other version as its
 * words, each value that a version shows written by `valueText`. What its
 * pill shows, joined by `dynamicAttributePillName`.
 */
export const dynamicAttributeWordings = (
  dynamicAttribute: DynamicAttribute,
  wordingOf: (
    wording: unknown,
  ) => StoredTranslation | undefined = firstTranslation,
  valueText: WordingValueText = valueNamed,
): string[] =>
  dynamicAttributeVersions(dynamicAttribute).flatMap((version) => {
    const found = wordingOf(version.wording);
    if (found === undefined) return [];
    return version.role === 'number'
      ? numberWordingExamples(found.message, found.locale, valueText)
      : [versionWordingText(found.message, found.locale, valueText)];
  });

/** Whether `path` begins with every part of `prefix`. */
const startsWith = (
  path: readonly PropertyKey[],
  prefix: readonly PropertyKey[],
): boolean => prefix.every((part, index) => path[index] === part);

/**
 * The version of `dynamicAttribute` that `path` (a path in the definition) is
 * about: the version whose wording it is in, or whose entry of a case or an
 * answer it is in, such as the condition that a case tests. Undefined for a
 * path outside every version.
 */
export const dynamicAttributeVersionAt = (
  dynamicAttribute: DynamicAttribute,
  path: readonly PropertyKey[],
): DynamicAttributeVersion | undefined =>
  dynamicAttributeVersions(dynamicAttribute).find(
    (version) =>
      startsWith(path, version.path) ||
      // The entry that contains the wording and what chooses it.
      (version.keyPath !== undefined &&
        startsWith(path, version.path.slice(0, -1))),
  );

/** The definition `value` is, read leniently, or undefined. */
export const asDynamicAttribute = (
  value: unknown,
): DynamicAttribute | undefined => {
  if (!isRecord(value)) return undefined;
  switch (value.logic) {
    case 'conditions':
      return Array.isArray(value.cases)
        ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the stage's own value, which only the editor writes; each part is read defensively where it is used
          (value as DynamicAttribute)
        : undefined;
    case 'answers':
      return typeof value.value === 'string' && Array.isArray(value.answers)
        ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- as above
          (value as DynamicAttribute)
        : undefined;
    case 'number':
    case 'participant':
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- as above
      return value as DynamicAttribute;
    default:
      return undefined;
  }
};

export const namingFor = (
  intl: IntlShape,
  sources: NamingSources,
): ValueNaming => {
  const attributeLabel = (
    role: DynamicValueRole,
    attribute: string,
  ): PresentationalText => {
    // The two nodes of a pair have the same attributes, so their values say
    // which node they belong to; any other value is named by its attribute.
    if (role === 'dyadSource') {
      return intl.formatMessage(valueNamingMessages.firstNodeValue, {
        attribute,
      });
    }
    if (role === 'dyadTarget') {
      return intl.formatMessage(valueNamingMessages.secondNodeValue, {
        attribute,
      });
    }
    // The researcher's name for the attribute, not the interface's words.
    return { text: attribute, dir: 'auto' };
  };
  const labelOf = (role: DynamicValueRole): string => {
    if (role === 'dyadSource' || role === 'edgeFrom') {
      return intl.formatMessage(valueNamingMessages.firstNodeLabel);
    }
    if (role === 'dyadTarget' || role === 'edgeTo') {
      return intl.formatMessage(valueNamingMessages.secondNodeLabel);
    }
    return intl.formatMessage(valueNamingMessages.nodeLabel);
  };
  const variableOfParsed = (
    parsed: ParsedDynamicValuePath | undefined,
  ): Record<string, unknown> | undefined => {
    if (parsed?.kind !== 'attribute') return undefined;
    const atSite = sources.context.variablesFor(parsed.role)?.[
      parsed.variableId
    ];
    return isRecord(atSite)
      ? atSite
      : codebookVariable(sources.codebook, parsed.variableId);
  };
  const wordingText = (wording: unknown) => sources.labelText?.(wording) ?? '';
  // `naming` are the dynamic attributes whose names are being written
  // further out: wording that shows one of them again, which validation
  // refuses, names it by an ellipsis rather than for ever.
  const dynamicAttributeName = (
    id: string,
    naming: ReadonlySet<string> = new Set(),
  ): string | undefined => {
    const dynamicAttribute = asDynamicAttribute(
      sources.dynamicAttributes !== undefined &&
        Object.hasOwn(sources.dynamicAttributes, id)
        ? sources.dynamicAttributes[id]
        : undefined,
    );
    if (dynamicAttribute === undefined) return undefined;
    const within = new Set([...naming, id]);
    return dynamicAttributePillName(
      dynamicAttributeWordings(dynamicAttribute, sources.wordingOf, (name) => {
        const parsed = parseDynamicValueName(name);
        if (parsed?.kind === 'dynamicAttribute') {
          if (within.has(parsed.id)) return '…';
          const shown = dynamicAttributeName(parsed.id, within);
          return shown === undefined ? '' : `[${shown}]`;
        }
        return `[${presentationalTextValue(recordedLabel(name))}]`;
      }),
    );
  };
  const recordedLabel = (name: string): PresentationalText => {
    const parsed = parseDynamicValueName(name);
    if (parsed === undefined) return { text: name, dir: 'auto' };
    switch (parsed.kind) {
      case 'intrinsic':
        return intl.formatMessage(valueNamingMessages.today);
      case 'label':
        // In a node type's own label, the label is the one the interview
        // would otherwise have chosen.
        return sources.context.nodeLabel === true
          ? intl.formatMessage(valueNamingMessages.defaultNodeLabel)
          : labelOf(parsed.role);
      case 'participant':
        return intl.formatMessage(valueNamingMessages.isParticipant);
      case 'condition':
        return sources.conditions !== undefined &&
          Object.hasOwn(sources.conditions, parsed.conditionId)
          ? intl.formatMessage(valueNamingMessages.yes)
          : intl.formatMessage(valueNamingMessages.deletedCondition);
      case 'dynamicAttribute': {
        const shown = dynamicAttributeName(parsed.id);
        // The wording someone wrote, in its own direction. Every version
        // empty is a dynamic attribute that shows nothing.
        if (shown === undefined) {
          return intl.formatMessage(
            valueNamingMessages.deletedDynamicAttribute,
          );
        }
        return shown === ''
          ? intl.formatMessage(valueNamingMessages.showsNothing)
          : { text: shown, dir: 'auto' };
      }
      case 'attribute': {
        const variableName = variableOfParsed(parsed)?.name;
        return typeof variableName === 'string' && variableName !== ''
          ? attributeLabel(parsed.role, variableName)
          : intl.formatMessage(valueNamingMessages.deletedAttribute);
      }
      default: {
        const unhandled: never = parsed;
        throw new Error('Unhandled value name', { cause: unhandled });
      }
    }
  };
  const valueLabel = (choice: DynamicValueChoice): PresentationalText => {
    if (choice.role === undefined) {
      return intl.formatMessage(valueNamingMessages.today);
    }
    if (choice.kind === 'condition' || choice.kind === 'participant') {
      return recordedLabel(choice.name);
    }
    if (choice.kind === 'label' && choice.defaultLabel === true) {
      return intl.formatMessage(valueNamingMessages.defaultNodeLabel);
    }
    if (choice.kind === 'label') return labelOf(choice.role);
    return attributeLabel(
      choice.role,
      choice.variableName ?? choice.variableId,
    );
  };
  const answerLabel = (argument: string, key: string): string | undefined => {
    if (key === TRUE_CASE || key === FALSE_CASE) {
      const variable = variableOfParsed(parseDynamicValueName(argument));
      const options: unknown[] = Array.isArray(variable?.options)
        ? variable.options
        : [];
      const option = options.find(
        (each) => isRecord(each) && each.value === (key === TRUE_CASE),
      );
      const text = isRecord(option)
        ? optionLabelText(wordingText(option.label))
        : '';
      if (text !== '') return text;
      return intl.formatMessage(
        key === TRUE_CASE ? valueNamingMessages.yes : valueNamingMessages.no,
      );
    }
    const optionId = optionIdFromCaseKey(key);
    if (optionId === undefined) return undefined;
    const variable = variableOfParsed(parseDynamicValueName(argument));
    const options: unknown[] = Array.isArray(variable?.options)
      ? variable.options
      : [];
    const option = options.find(
      (each) => isRecord(each) && each.id === optionId,
    );
    if (!isRecord(option)) {
      return intl.formatMessage(valueNamingMessages.deletedOption);
    }
    const text = optionLabelText(wordingText(option.label));
    return text !== '' ? text : String(option.value);
  };
  const pillFor = (name: string): VariablePillProps => {
    const parsed = parseDynamicValueName(name);
    const label = recordedLabel(name);
    // The interface's words in the interface's language; a name that
    // someone wrote in its own direction.
    const language =
      sources.interfaceLanguage === undefined
        ? {}
        : interfaceLanguage(label, sources.interfaceLanguage);
    const shown = { name: presentationalTextValue(label), ...language };
    switch (parsed?.kind) {
      case 'intrinsic':
        return { ...shown, kind: 'datetime' };
      case 'label':
        return { ...shown, kind: 'text' };
      case 'participant':
      case 'condition':
        return { ...shown, kind: 'boolean' };
      case 'dynamicAttribute':
        return dynamicAttributeName(parsed.id) === undefined
          ? { ...shown, kind: 'dynamic', missing: true }
          : { ...shown, kind: 'dynamic' };
      case 'attribute': {
        const variable = variableOfParsed(parsed);
        return variable === undefined
          ? { ...shown, missing: true }
          : {
              ...shown,
              kind: variablePillKindOf(
                typeof variable.type === 'string' ? variable.type : undefined,
              ),
            };
      }
      case undefined:
      default:
        return { ...shown, missing: true };
    }
  };
  return {
    valueLabel,
    recordedLabel,
    answerLabel,
    variableOf: (name) => variableOfParsed(parseDynamicValueName(name)),
    pillFor,
  };
};
