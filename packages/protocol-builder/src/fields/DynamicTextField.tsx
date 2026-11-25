import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import RichTextEditorField, {
  type RichTextAssetBlocks,
  type RichTextEditorToken,
  type RichTextInsertMenu,
  type RichTextInsertMenuItem,
  type RichTextVersionsActionEvent,
  type RichTextVersionsAttributes,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import { optionLabelText } from '@codaco/fresco-ui/OptionLabel';
import { presentationalTextValue } from '@codaco/fresco-ui/PresentationalText';
import {
  markdownElementsFor,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import {
  TokenPill,
  type TokenPillLabel,
  useTokenPillLanguage,
} from '@codaco/fresco-ui/TokenPill';
import {
  type Codebook,
  createConditionId,
  type DynamicValueRole,
  type DynamicValueSite,
  type DynamicValueSiteContext,
  dynamicValueNameFor,
  dynamicValueNamesIn,
  escapeMessageText,
  FALSE_CASE,
  findSiteMessageProblem,
  type LocaleTag,
  type LocalizedString,
  type LocalizedTextShape,
  MISSING_CASE,
  type MessageNode,
  type MessageSwitch,
  messageStructure,
  optionIdFromCaseKey,
  type ParsedDynamicValuePath,
  parseDynamicValueName,
  pluralValueExamples,
  printMessageStructure,
  TRUE_CASE,
} from '@codaco/protocol-validation';

import { variableTypeLabel } from '../codebook/variableTypeLabels.ts';
import {
  asConditionDraft,
  type ConditionDraft,
  conditionAboutChoices,
  conditionCodebook,
  conditionIdOfName,
  conditionSentence,
} from '../localization/conditionText.ts';
import {
  type DynamicValueChoice,
  dynamicValueChoices,
  isFlagChoice,
} from '../localization/dynamicValueCatalog.ts';
import { LocalizedStringField } from '../localization/LocalizedStringControl.tsx';
import { resolveTranslation } from '../localization/localizedText.ts';
import {
  countTokenId,
  documentToMessageNodes,
  type IfBlockLabels,
  type IfRow,
  ifBlockAttributes,
  ifBlockRowsIn,
  ifRowOf,
  type MessageDocumentFormat,
  type MessageDocumentLabels,
  messageToDocument,
  openMessageDocument,
} from '../localization/messageDocument.ts';
import { useEditingLanguage } from '../localization/ProtocolLocalization.tsx';
import {
  richTextToolbarFor,
  textFieldPropsFor,
} from '../localization/textShape.ts';
import {
  type DynamicValueConditions,
  type DynamicValueSiteState,
  useDynamicValueSite,
} from '../localization/useDynamicValueSite.ts';
import type { RichTextContent } from '../markdown/markdownAdapter.ts';
import ConditionDialog from '../rules/ConditionDialog.tsx';
import { StageAssetBlocks } from './assetBlocks/StageAssetBlocks.tsx';
import { participantVersionMessages } from './messageArgumentLabels.ts';

const PLAIN_LINE: LocalizedTextShape = { format: 'plain', lines: 'single' };

const messages = defineMessages({
  insertMenu: {
    id: 'protocolBuilder.dynamicText.insertMenu',
    defaultMessage:
      'Inject piped text from interview metadata or a network attribute',
    description:
      'Accessible name and tooltip of a toolbar icon button (a syringe), and the name of the searchable menu it opens, in a text field a participant reads. “Piped text” is survey-software vocabulary for text filled in from earlier data: the button injects a value the interview fills in, such as today’s date (interview metadata) or the participant’s name or an answer they gave earlier (a network attribute).',
  },
  interviewGroup: {
    id: 'protocolBuilder.dynamicText.interviewGroup',
    defaultMessage: 'Interview Attributes',
    description:
      'Heading in the insert-a-value menu above values that come from the interview itself rather than from the network, such as today’s date.',
  },
  today: {
    id: 'protocolBuilder.dynamicText.today',
    defaultMessage: 'Today’s date',
    description:
      'A value a researcher can insert into text a participant reads: the date on the day the participant reads it.',
  },
  roleEgo: {
    id: 'protocolBuilder.dynamicText.roleEgo',
    defaultMessage: 'Ego Attributes',
    description:
      'Heading in the insert-a-value menu above the attributes of the ego, the participant taking part in the interview. “Ego” is the network-research term Architect uses for the participant.',
  },
  roleContext: {
    id: 'protocolBuilder.dynamicText.roleContext',
    defaultMessage: 'Contextual Attributes',
    description:
      'Heading in the insert-a-value menu above the attributes of whatever the text is shown alongside: the node or edge a form asks about, the node a question is asking about, or both nodes of a pair a question asks about together (each of those values then starts “First node:” or “Second node:”). It may not be a person, so the heading does not say what it is.',
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
  nodeLabelDescription: {
    id: 'protocolBuilder.dynamicText.nodeLabelDescription',
    defaultMessage: 'Text shown on the node',
    description:
      'Short note under “Node label” in the insert-a-value menu, saying that the value is the same text the interview shows on the node itself. Other items in the menu show the kind of answer here, such as “Text” or “Number”.',
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
      'Name of a value in the insert-a-value menu of a question on the Family Pedigree stage, and of the piece of text it inserts: whether the family member the question is asked about is the participant themselves or someone else in their family. It only chooses between two versions of the text and is never shown itself.',
  },
  byParticipant: {
    id: 'protocolBuilder.dynamicText.byParticipant',
    defaultMessage: 'Different wording for the participant and everyone else',
    description:
      'Second line of the “Participant or someone else” entry in the insert-a-value menu. Choosing it inserts a piece of text with two versions: one shown when the question is asked about the participant themselves (such as “Are you still living?”), one for everyone else in their family (such as “Is this person still living?”).',
  },
  defaultNodeLabel: {
    id: 'protocolBuilder.dynamicText.defaultNodeLabel',
    defaultMessage: 'Default label',
    description:
      'Name of an inserted value, as it appears in the text and in the insert-a-value menu of a node type’s own label: the label the interview would choose for the node if the node type had no label of its own, taken from the node’s name or another of its answers. A node is one entity in the network, which may not be a person.',
  },
  defaultNodeLabelDescription: {
    id: 'protocolBuilder.dynamicText.defaultNodeLabelDescription',
    defaultMessage:
      'The label the interview would give the node if this label were not set',
    description:
      'Short note under “Default label” in the insert-a-value menu of a node type’s own label, saying that the value is the label the interview chooses by its usual rules (the node’s name, or another of its answers).',
  },
  nodeAttributesGroup: {
    id: 'protocolBuilder.dynamicText.nodeAttributesGroup',
    defaultMessage: 'Node Attributes',
    description:
      'Heading in the insert-a-value menu of a node type’s own label, above the default label and the attributes of the node the label is shown on. A node is one entity in the network, which may not be a person.',
  },
  logicMenu: {
    id: 'protocolBuilder.dynamicText.logicMenu',
    defaultMessage: 'Insert logic',
    description:
      'Name of the toolbar button, beside the insert-a-value button, that opens a menu of logic to insert into a piece of text that a participant reads: an “If” whose rules the researcher sets, or different wording for each answer to an attribute. Also names the menu.',
  },
  logicIf: {
    id: 'protocolBuilder.dynamicText.logicIf',
    defaultMessage: 'If … else',
    description:
      'Entry in the insert-logic menu. Choosing it asks for rules, then inserts a piece of text with two versions: one shown when the rules are met, one shown otherwise. The ellipsis stands for the rules.',
  },
  logicIfDescription: {
    id: 'protocolBuilder.dynamicText.logicIfDescription',
    defaultMessage: 'One wording when rules you set are met, another otherwise',
    description:
      'Second line of the “If … else” entry in the insert-logic menu, saying what it inserts.',
  },
  logicIfNot: {
    id: 'protocolBuilder.dynamicText.logicIfNot',
    defaultMessage: 'If not … else',
    description:
      'Entry in the insert-logic menu. Choosing it asks for rules, then inserts a piece of text with two versions: one shown when the rules are NOT met, one shown otherwise. The ellipsis stands for the rules.',
  },
  logicIfNotDescription: {
    id: 'protocolBuilder.dynamicText.logicIfNotDescription',
    defaultMessage:
      'One wording when rules you set are not met, another otherwise',
    description:
      'Second line of the “If not … else” entry in the insert-logic menu, saying what it inserts.',
  },
  newIfTitle: {
    id: 'protocolBuilder.dynamicText.newIfTitle',
    defaultMessage: 'When should this text be shown?',
    description:
      'Title of the dialog where a researcher sets the rules of a new “If” in a piece of text that a participant reads.',
  },
  editIfTitle: {
    id: 'protocolBuilder.dynamicText.editIfTitle',
    defaultMessage: 'Edit rules',
    description:
      'Title of the dialog where a researcher changes the rules of an “If” in a piece of text that a participant reads. Also names the button on each row of an “If” that opens it.',
  },
  ifRow: {
    id: 'protocolBuilder.dynamicText.ifRow',
    defaultMessage: 'If: {rules}',
    description:
      'Label of the first row of an “If” in a piece of text: the wording shown when its rules are met. rules is those rules as a phrase, such as “Age is more than 30” or “Friend exists and Close is true”. Also what the “If” is called while folded to a pill.',
  },
  ifNotRow: {
    id: 'protocolBuilder.dynamicText.ifNotRow',
    defaultMessage: 'If not: {rules}',
    description:
      'Label of the first row of an “If not” in a piece of text: the wording shown when its rules are NOT met. rules is those rules as a phrase, such as “Age is more than 30”.',
  },
  elseIfRow: {
    id: 'protocolBuilder.dynamicText.elseIfRow',
    defaultMessage: 'Else if: {rules}',
    description:
      'Label of a later row of an “If” in a piece of text: the wording shown when the rows above did not apply and this row’s rules are met. rules is those rules as a phrase, such as “Age is more than 30”.',
  },
  elseIfNotRow: {
    id: 'protocolBuilder.dynamicText.elseIfNotRow',
    defaultMessage: 'Else if not: {rules}',
    description:
      'Label of a later row of an “If” in a piece of text: the wording shown when the rows above did not apply and this row’s rules are NOT met. rules is those rules as a phrase.',
  },
  noRules: {
    id: 'protocolBuilder.dynamicText.noRules',
    defaultMessage: '(no rules yet)',
    description:
      'Stands in for the rules of an “If” in a piece of text when it has none that can be described, in a label such as “If (no rules yet)”.',
  },
  addElseIf: {
    id: 'protocolBuilder.dynamicText.addElseIf',
    defaultMessage: 'Add else if',
    description:
      'Button under the rows of an “If” in a piece of text. It asks for rules, then adds a row shown when the rows above it did not apply and those rules are met.',
  },
  removeIfRow: {
    id: 'protocolBuilder.dynamicText.removeIfRow',
    defaultMessage: 'Remove this case',
    description:
      'Names the button that removes one row (its rules and its wording) from an “If” in a piece of text that has more than one.',
  },
  versionOtherwise: {
    id: 'protocolBuilder.dynamicText.versionOtherwise',
    defaultMessage: 'Otherwise',
    description:
      'Label of the last row of an “If” in a piece of text: the wording shown when none of the rows above applied.',
  },
  byAnswer: {
    id: 'protocolBuilder.dynamicText.byAnswer',
    defaultMessage: 'Different wording for each answer',
    description:
      'Second line of an entry in the insert-a-value menu. Choosing it inserts a piece of text with one version for each answer to this attribute, so the text can say something different depending on the answer.',
  },
  needsAnswerLabels: {
    id: 'protocolBuilder.dynamicText.needsAnswerLabels',
    defaultMessage: 'Add labels for its yes and no answers first',
    description:
      'Second line of an entry in the insert-a-value menu that cannot be chosen yet. The entry is a yes-or-no attribute without its own words for its two answers, so the text has nothing in the protocol’s languages to show for it. The researcher can add those words where the attribute is set up.',
  },
  switchHasNoLabels: {
    id: 'protocolBuilder.dynamicText.switchHasNoLabels',
    defaultMessage:
      'A Toggle has no labels for its answers. Use different wording for each answer instead.',
    description:
      'Second line of an entry in the insert-a-value menu that cannot be chosen. The entry is a yes-or-no attribute answered with a Toggle (Architect’s name for a single on/off switch, kept as the one word “Toggle” as elsewhere in Architect), which has no researcher-written labels for its two answers, so the text cannot show the answer itself. The menu has another entry for the same attribute, “Different wording for each answer”, which the researcher can use instead.',
  },
  byNumber: {
    id: 'protocolBuilder.dynamicText.byNumber',
    defaultMessage: 'Wording that fits the number',
    description:
      'Second line of an entry in the insert-a-value menu. Choosing it inserts a piece of text with a version for each kind of number (such as one or several), so the words agree with the number, as in “1 child” and “3 children”.',
  },
  versionMissing: {
    id: 'protocolBuilder.dynamicText.versionMissing',
    defaultMessage: 'If not known',
    description:
      'Label of the version of a piece of text shown when the value it depends on has not been given, such as a name the participant skipped.',
  },
  versionKnown: {
    id: 'protocolBuilder.dynamicText.versionKnown',
    defaultMessage: 'If known',
    description:
      'Label of the version of a piece of text shown when the value it depends on has been given.',
  },
  versionOtherAnswer: {
    id: 'protocolBuilder.dynamicText.versionOtherAnswer',
    defaultMessage: 'Any other answer',
    description:
      'Label of the version of a piece of text shown for an answer that has no version of its own.',
  },
  versionNumbers: {
    id: 'protocolBuilder.dynamicText.versionNumbers',
    defaultMessage: 'When it is {numbers}',
    description:
      'Label of the version of a piece of text shown for some numbers. numbers lists examples of those numbers, in the language being edited, such as “1” or “0, 2, 3, …”.',
  },
  yes: {
    id: 'protocolBuilder.dynamicText.yes',
    defaultMessage: 'Yes',
    description:
      'Label of the version of a piece of text shown when a yes-or-no attribute is yes.',
  },
  deletedAttribute: {
    id: 'protocolBuilder.dynamicText.deletedAttribute',
    defaultMessage: 'Deleted attribute',
    description:
      'Shown in place of a value in a piece of text that a participant reads, when the attribute that the value comes from has been deleted from the codebook. The researcher should remove the value or insert another one.',
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
  no: {
    id: 'protocolBuilder.dynamicText.no',
    defaultMessage: 'No',
    description:
      'Label of the version of a piece of text shown when a yes-or-no attribute is no.',
  },
});

/** How many examples a plural version's label gives of its numbers. */
const EXAMPLE_COUNT = 3;

type Naming = Readonly<{
  /**
   * What a value is called where it shows in the text: the interface's words,
   * or an attribute's own name, which reads in its own direction.
   */
  valueLabel: (choice: DynamicValueChoice) => TokenPillLabel;
  /** The heading it is listed under in the insert menu. */
  groupLabel: (choice: DynamicValueChoice) => string;
  /**
   * What a value that this place does not offer is called, by the name that
   * the text uses for it: an attribute by its name wherever the codebook
   * still has it, and one that is gone as a deleted attribute. Only a name
   * that refers to no kind of value at all is shown as it is written.
   */
  recordedLabel: (name: string) => TokenPillLabel;
  /**
   * What a version of a set of versions on `argument` is called when the
   * value that it is on does not list it: the option of the attribute that
   * the key chooses, or a deleted option. Undefined for a key that chooses
   * no option.
   */
  recordedVersionLabel: (argument: string, key: string) => string | undefined;
  /**
   * What the version of a condition's set of versions keyed `key` (`true` or
   * `false`) is called: the condition's rules, as met or as not met.
   */
  conditionVersionLabel: (conditionId: string, key: string) => string;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

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

/** What the names in a text are looked up in, beyond what a place offers. */
type NamingSources = Readonly<{
  context: DynamicValueSiteContext;
  codebook?: Readonly<Codebook> | undefined;
  /** The conditions declared beside the text, by id. */
  conditions?: Readonly<Record<string, unknown>> | undefined;
  /** An option's label in the language being read. */
  labelText?: (label: unknown) => string;
}>;

const namingFor = (
  intl: IntlShape,
  sources: NamingSources,
  // Where the conditions themselves are not in reach, an "If" is named
  // without its rules.
  conditionLabel: (conditionId: string, key?: string) => string = (_, key) =>
    intl.formatMessage(
      key === FALSE_CASE ? messages.ifNotRow : messages.ifRow,
      {
        rules: '…',
      },
    ),
): Naming => {
  const attributeLabel = (
    role: DynamicValueRole,
    attribute: string,
  ): TokenPillLabel => {
    // The two nodes of a pair have the same attributes, so their values say
    // which node they belong to; any other value is named by its attribute.
    if (role === 'dyadSource') {
      return intl.formatMessage(messages.firstNodeValue, { attribute });
    }
    if (role === 'dyadTarget') {
      return intl.formatMessage(messages.secondNodeValue, { attribute });
    }
    // The researcher's name for the attribute, not the interface's words.
    return { text: attribute, dir: 'auto' };
  };
  const labelOf = (role: DynamicValueRole): string => {
    // Of two nodes on screen, a pair's or an edge's ends, a label says
    // which node it is; a node alone just has its label.
    if (role === 'dyadSource' || role === 'edgeFrom') {
      return intl.formatMessage(messages.firstNodeLabel);
    }
    if (role === 'dyadTarget' || role === 'edgeTo') {
      return intl.formatMessage(messages.secondNodeLabel);
    }
    return intl.formatMessage(messages.nodeLabel);
  };
  /** The attribute `parsed` names, at this place or anywhere in the codebook. */
  const variableOf = (
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
  return {
    valueLabel: (choice) => {
      if (choice.role === undefined) return intl.formatMessage(messages.today);
      if (choice.kind === 'condition') {
        return conditionLabel(choice.condition?.id ?? '');
      }
      if (choice.kind === 'label' && choice.defaultLabel === true) {
        return intl.formatMessage(messages.defaultNodeLabel);
      }
      if (choice.kind === 'label') return labelOf(choice.role);
      if (choice.kind === 'participant') {
        return intl.formatMessage(messages.isParticipant);
      }
      return attributeLabel(
        choice.role,
        choice.variableName ?? choice.variableId,
      );
    },
    recordedLabel: (name) => {
      const parsed = parseDynamicValueName(name);
      if (parsed === undefined) return { text: name, dir: 'auto' };
      switch (parsed.kind) {
        case 'intrinsic':
          return intl.formatMessage(messages.today);
        case 'label':
          return labelOf(parsed.role);
        case 'participant':
          return intl.formatMessage(messages.isParticipant);
        case 'condition':
          return sources.conditions !== undefined &&
            Object.hasOwn(sources.conditions, parsed.conditionId)
            ? conditionLabel(parsed.conditionId)
            : intl.formatMessage(messages.deletedCondition);
        case 'attribute': {
          const variableName = variableOf(parsed)?.name;
          return typeof variableName === 'string' && variableName !== ''
            ? attributeLabel(parsed.role, variableName)
            : intl.formatMessage(messages.deletedAttribute);
        }
        default: {
          const unhandled: never = parsed;
          throw new Error('Unhandled value name', { cause: unhandled });
        }
      }
    },
    recordedVersionLabel: (argument, key) => {
      if (key === TRUE_CASE) return intl.formatMessage(messages.yes);
      if (key === FALSE_CASE) return intl.formatMessage(messages.no);
      const optionId = optionIdFromCaseKey(key);
      if (optionId === undefined) return undefined;
      const variable = variableOf(parseDynamicValueName(argument));
      const options: unknown[] = Array.isArray(variable?.options)
        ? variable.options
        : [];
      const option = options.find(
        (each) => isRecord(each) && each.id === optionId,
      );
      const text =
        isRecord(option) && sources.labelText !== undefined
          ? optionLabelText(sources.labelText(option.label))
          : '';
      if (text !== '') return text;
      return isRecord(option)
        ? String(option.value)
        : intl.formatMessage(messages.deletedOption);
    },
    conditionVersionLabel: (conditionId, key) =>
      sources.conditions !== undefined &&
      Object.hasOwn(sources.conditions, conditionId)
        ? conditionLabel(conditionId, key)
        : intl.formatMessage(
            key === FALSE_CASE ? messages.ifNotRow : messages.ifRow,
            { rules: intl.formatMessage(messages.deletedCondition) },
          ),
    // Everything the text is shown with, one node, a pair or an edge's two
    // ends, is listed together; a value of a pair's node says which node.
    groupLabel: (choice) =>
      intl.formatMessage(
        choice.ownNode === true
          ? messages.nodeAttributesGroup
          : choice.role === undefined
            ? messages.interviewGroup
            : choice.role === 'ego'
              ? messages.roleEgo
              : messages.roleContext,
      ),
  };
};

/** The inline content of a one-line message, as the editor holds it. */
export const inlineContent = (
  nodes: readonly MessageNode[],
  format: MessageDocumentFormat,
  labels: MessageDocumentLabels,
): RichTextContent[] =>
  messageToDocument(nodes, { ...format, singleLine: true }, labels).content?.[0]
    ?.content ?? [];

/** A value shown only when it is known, as a value that can be missing must be. */
const presenceSwitch = (
  name: string,
  known: readonly MessageNode[],
): MessageSwitch => ({
  kind: 'switch',
  argument: name,
  type: 'select',
  versions: [
    { key: MISSING_CASE, nodes: [] },
    { key: 'other', nodes: known },
  ],
});

/** The plural categories a number switch has versions for, `other` last. */
export const pluralCategories = (locale: LocaleTag): string[] => {
  const categories = [...pluralValueExamples(locale).keys()].filter(
    (category) => category !== 'other',
  );
  return [...categories, 'other'];
};

export const isBlankMessage = (nodes: readonly MessageNode[]): boolean =>
  nodes.every((node) => node.kind === 'text' && node.text.trim() === '');

/**
 * What a switch on a number is called, and each of its versions: examples
 * of the numbers it is for, in `locale`. Shared with the editor of interface
 * wording (`LocalizedMessageVersions`), whose numbers switch the same way.
 */
export const numberSwitchLabels = (intl: IntlShape, locale: LocaleTag) => ({
  switchLabel: (value: string) => `Wording that fits the number ${value}`,
  versionLabel: (key: string) => {
    const exact = /^=(\d+)$/.exec(key);
    const counts = exact
      ? [Number(exact[1])]
      : ([...pluralValueExamples(locale)].find(
          ([category]) => category === key,
        )?.[1] ?? []);
    const shown = counts
      .slice(0, EXAMPLE_COUNT)
      .map((count) => intl.formatNumber(count));
    return intl.formatMessage(messages.versionNumbers, {
      numbers: intl.formatList(
        counts.length > EXAMPLE_COUNT ? [...shown, '…'] : shown,
        { type: 'unit', style: 'short' },
      ),
    });
  },
  /** The insert menu's second line for wording that fits a number. */
  menuDescription: () => intl.formatMessage(messages.byNumber),
});

type MessageLabelInputs = Readonly<{
  intl: IntlShape;
  naming: Naming;
  /** The value each name in the text stands for. */
  choiceByName: ReadonlyMap<string, DynamicValueChoice>;
  locale: LocaleTag;
  labelText: (label: unknown) => string;
}>;

/** What the editor and the summary call a set of versions, and each version. */
const messageLabelsFor = ({
  intl,
  naming,
  choiceByName,
  locale,
  labelText,
}: MessageLabelInputs): MessageDocumentLabels => ({
  switchSummary: (node) => {
    const choice = choiceByName.get(node.argument);
    return choice === undefined
      ? naming.recordedLabel(node.argument)
      : naming.valueLabel(choice);
  },
  switchLabel: (node) => {
    const choice = choiceByName.get(node.argument);
    const value = presentationalTextValue(
      choice === undefined
        ? naming.recordedLabel(node.argument)
        : naming.valueLabel(choice),
    );
    if (node.type === 'plural') {
      return numberSwitchLabels(intl, locale).switchLabel(value);
    }
    if (choice?.kind === 'condition') return value;
    const presence = node.versions.every(
      (version) => version.key === MISSING_CASE || version.key === 'other',
    );
    return presence
      ? `Wording depending on whether ${value} is known`
      : `Wording for each answer to ${value}`;
  },
  versionLabel: (node, key) => {
    if (node.type === 'plural') {
      return numberSwitchLabels(intl, locale).versionLabel(key);
    }
    if (key === MISSING_CASE)
      return intl.formatMessage(messages.versionMissing);
    // A version is named for what chooses it: `true` and `false` for
    // themselves, and `other` for whichever of the two the text gives no
    // version of its own.
    // Read from the name, so that a value this place does not offer is
    // named the same way.
    const named = parseDynamicValueName(node.argument);
    if (named?.kind === 'participant') {
      const keys = new Set(node.versions.map((version) => version.key));
      const aboutParticipant =
        key === 'other'
          ? keys.has(FALSE_CASE) && !keys.has(TRUE_CASE)
          : key !== FALSE_CASE;
      return intl.formatMessage(
        aboutParticipant
          ? participantVersionMessages.aboutParticipant
          : participantVersionMessages.aboutSomeoneElse,
      );
    }
    // A condition switched on in some shape other than an "If" (text another
    // tool wrote): each version is named for the condition, met or not met.
    if (named?.kind === 'condition') {
      if (key === TRUE_CASE || key === FALSE_CASE) {
        return naming.conditionVersionLabel(named.conditionId, key);
      }
      if (key === 'other') return intl.formatMessage(messages.versionOtherwise);
    }
    const presence = node.versions.every(
      (version) => version.key === MISSING_CASE || version.key === 'other',
    );
    if (key === 'other') {
      return intl.formatMessage(
        presence ? messages.versionKnown : messages.versionOtherAnswer,
      );
    }
    const choice = choiceByName.get(node.argument);
    const matched = choice?.options.find((each) => each.caseKey === key);
    if (matched !== undefined) {
      const text = optionLabelText(labelText(matched.label));
      if (text !== '') return text;
      if (typeof matched.value === 'boolean') {
        return intl.formatMessage(matched.value ? messages.yes : messages.no);
      }
      return String(matched.value);
    }
    // A key the value does not list: an option of an attribute this place
    // does not offer, or one deleted since the text was written. Only a key
    // that names no option at all is shown as it is written.
    return naming.recordedVersionLabel(node.argument, key) ?? key;
  },
});

/**
 * What a text's editor knows about where the text sits: what it can show
 * there, and the conditions it can test.
 */
export type DynamicMessageSite = Readonly<{
  context: DynamicValueSiteState['context'];
  /**
   * The conditions the text can test, and what their rules may be about.
   * Without `set` they are read, to say what each "If" tests, and never
   * written.
   */
  conditions?: Omit<DynamicValueConditions, 'set'> &
    Readonly<{ set?: DynamicValueConditions['set'] }>;
}>;

/** An "If" whose rules a researcher is setting, in the dialog. */
type ConditionEditing =
  | Readonly<{
      kind: 'insert';
      negated: boolean;
      insert: (content: readonly RichTextContent[]) => void;
    }>
  | Readonly<{
      kind: 'edit';
      conditionId: string;
      event: RichTextVersionsActionEvent;
    }>
  | Readonly<{ kind: 'elseIf'; event: RichTextVersionsActionEvent }>;

const NO_CONDITIONS: Readonly<Record<string, unknown>> = Object.freeze({});

const NEW_CONDITION: ConditionDraft = Object.freeze({ rules: [] });

/** The action of an "If" that adds a row to it. */
const ADD_ELSE_IF = 'addElseIf';

export type DynamicMessageEditorProps = Readonly<{
  id: string;
  name: string;
  ariaDescribedBy: string;
  ariaLabelledBy?: string;
  ariaInvalid?: boolean;
  ariaRequired?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  readOnly: boolean;
  markdown: boolean;
  singleLine: boolean;
  /**
   * How the files the text holds as blocks are drawn and chosen, for text
   * declared to hold them (`textFieldPropsFor`). Absent for any other text,
   * where an image written into it is read as its description.
   */
  assetBlocks?: RichTextAssetBlocks;
  message: string;
  onMessageChange: (message: string | undefined) => void;
  locale: LocaleTag;
  site: DynamicMessageSite;
  /**
   * False where the host says what is wrong with the text itself, as the
   * translation table does once the researcher leaves the cell.
   */
  showsProblems?: boolean;
  /** Classes for the editor's own frame, which holds its text and toolbar. */
  className?: string;
}>;

/**
 * One translation of text a participant reads, with values the interview
 * fills in. Values show as chips; a value that can be missing sits in a
 * piece of text with a version for when it is known and one for when it is
 * not, so the participant never meets a gap. The insert menu (the toolbar
 * button, or typing `{`) offers what this place can show.
 */
export function DynamicMessageEditor({
  id,
  name,
  ariaDescribedBy,
  ariaLabelledBy,
  ariaInvalid,
  ariaRequired,
  placeholder,
  autoFocus,
  disabled,
  readOnly,
  markdown,
  singleLine,
  assetBlocks,
  message,
  onMessageChange,
  locale,
  site,
  showsProblems = true,
  className,
}: DynamicMessageEditorProps) {
  const intl = useAppIntl();
  const { localization } = useEditingLanguage();
  const holdsAssetBlocks = assetBlocks !== undefined;
  const format = useMemo(
    (): MessageDocumentFormat => ({
      markdown,
      singleLine,
      assetBlocks: holdsAssetBlocks,
    }),
    [markdown, singleLine, holdsAssetBlocks],
  );
  const { context } = site;
  const conditionValues = site.conditions?.values ?? NO_CONDITIONS;
  const setConditions = readOnly ? undefined : site.conditions?.set;
  const aboutChoices = conditionAboutChoices(context, site.conditions?.subject);
  const allowEgoRules =
    site.conditions?.allowEgoRules === true && context.roles.has('ego');
  // An "If" can be written where conditions can be, and where there is
  // something for its rules to be about.
  const writesConditions =
    setConditions !== undefined && (aboutChoices.length > 0 || allowEgoRules);
  const [editing, setEditing] = useState<ConditionEditing | null>(null);

  const labelText = (label: unknown): string =>
    label === undefined
      ? ''
      : resolveTranslation(label, localization, locale).text;

  /** What an "If" on these conditions reads as, in the editor. */
  const ifBlockFor = (
    values: Readonly<Record<string, unknown>>,
  ): IfBlockLabels => {
    const rulesOf = (argument: string): string => {
      const conditionId = conditionIdOfName(argument);
      // The rules of a condition deleted from the stage are gone with it.
      if (conditionId === undefined || !Object.hasOwn(values, conditionId)) {
        return intl.formatMessage(messages.deletedCondition);
      }
      const condition = asConditionDraft(
        conditionId !== undefined && Object.hasOwn(values, conditionId)
          ? values[conditionId]
          : undefined,
      );
      const sentence = conditionSentence(condition, {
        codebook: conditionCodebook(
          site.conditions?.codebook,
          site.conditions?.subject,
          condition.about ?? aboutChoices[0],
          true,
        ),
        intl,
        localization,
        locale,
      });
      return sentence === '' ? intl.formatMessage(messages.noRules) : sentence;
    };
    const rowLabel = (row: IfRow, index: number) =>
      intl.formatMessage(
        row.key === FALSE_CASE
          ? index === 0
            ? messages.ifNotRow
            : messages.elseIfNotRow
          : index === 0
            ? messages.ifRow
            : messages.elseIfRow,
        { rules: rulesOf(row.argument) },
      );
    const first = (rows: readonly IfRow[]) =>
      rows[0] === undefined ? '' : rowLabel(rows[0], 0);
    return {
      is: (node) =>
        node.type === 'select' &&
        conditionIdOfName(node.argument) !== undefined &&
        node.versions.length === 2 &&
        node.versions.some(({ key }) => key === 'other') &&
        node.versions.some(
          ({ key }) => key === TRUE_CASE || key === FALSE_CASE,
        ),
      label: first,
      summary: first,
      rowLabel,
      otherwiseLabel: intl.formatMessage(messages.versionOtherwise),
      ...(writesConditions && {
        rowAction: intl.formatMessage(messages.editIfTitle),
        rowRemovable: intl.formatMessage(messages.removeIfRow),
        actions: [
          { id: ADD_ELSE_IF, label: intl.formatMessage(messages.addElseIf) },
        ],
      }),
    };
  };
  const ifBlock = ifBlockFor(conditionValues);

  const naming = namingFor(
    intl,
    {
      context,
      codebook: site.conditions?.codebook,
      conditions: conditionValues,
      labelText,
    },
    (conditionId, key = TRUE_CASE) =>
      ifBlock.rowLabel(
        {
          argument: dynamicValueNameFor({ kind: 'condition', conditionId }),
          key,
        },
        0,
      ),
  );
  const choices = dynamicValueChoices(context);

  const items: RichTextInsertMenuItem[] = [];
  // Logic has a menu of its own: an "If", then wording by each answer.
  const logicItems: RichTextInsertMenuItem[] = writesConditions
    ? [false, true].map((negated) => ({
        id: negated ? 'ifNot' : 'if',
        label: intl.formatMessage(
          negated ? messages.logicIfNot : messages.logicIf,
        ),
        description: intl.formatMessage(
          negated
            ? messages.logicIfNotDescription
            : messages.logicIfDescription,
        ),
        content: [],
        request: (insert) => setEditing({ kind: 'insert', negated, insert }),
      }))
    : [];
  const choiceByName = new Map<string, DynamicValueChoice>(
    choices.map((choice) => [choice.name, choice]),
  );

  const labels: MessageDocumentLabels = {
    ...messageLabelsFor({
      intl,
      naming,
      choiceByName,
      locale,
      labelText,
    }),
    // A value shown when it is known is still a value; any other set of
    // versions is logic.
    variantOf: (node) =>
      node.versions.every(({ key }) => key === MISSING_CASE || key === 'other')
        ? 'value'
        : 'logic',
    ifBlock,
  };

  for (const choice of choices) {
    // A condition is written with the "If" that tests it, never chosen.
    if (choice.kind === 'condition') continue;
    const valueName = choice.name;
    const caseKeys = choice.options.map((option) => option.caseKey);
    const valueLabel = naming.valueLabel(choice);
    const group = naming.groupLabel(choice);
    const type = variableTypeLabel(choice.variableType);
    const argument: MessageNode = { kind: 'argument', name: valueName };
    const unshowable =
      choice.unshowable === undefined
        ? undefined
        : intl.formatMessage(
            choice.unshowable === 'switch'
              ? messages.switchHasNoLabels
              : messages.needsAnswerLabels,
          );
    // Whether the node is the participant is never shown, only worded for,
    // so it is offered once, as its two versions; so is how a node is
    // connected, and each of its type's conditions.
    if (isFlagChoice(choice)) {
      logicItems.push({
        id: `answers:${valueName}`,
        label: valueLabel,
        group,
        description: intl.formatMessage(messages.byParticipant),
        content: inlineContent(
          [
            {
              kind: 'switch',
              argument: valueName,
              type: 'select',
              versions: [
                ...caseKeys.map((key) => ({ key, nodes: [] })),
                { key: 'other', nodes: [] },
              ],
            },
          ],
          format,
          labels,
        ),
      });
      continue;
    }
    items.push({
      id: `value:${valueName}`,
      label: valueLabel,
      group,
      ...(unshowable !== undefined
        ? { description: unshowable, disabled: true }
        : choice.kind === 'label'
          ? {
              description: intl.formatMessage(
                choice.defaultLabel === true
                  ? messages.defaultNodeLabelDescription
                  : messages.nodeLabelDescription,
              ),
            }
          : type !== undefined && { description: intl.formatMessage(type) }),
      content: inlineContent(
        choice.optional ? [presenceSwitch(valueName, [argument])] : [argument],
        format,
        labels,
      ),
    });
    if (caseKeys.length > 0) {
      logicItems.push({
        id: `answers:${valueName}`,
        label: valueLabel,
        group,
        description: intl.formatMessage(messages.byAnswer),
        content: inlineContent(
          [
            {
              kind: 'switch',
              argument: valueName,
              type: 'select',
              versions: [
                { key: MISSING_CASE, nodes: [] },
                ...caseKeys.map((key) => ({ key, nodes: [] })),
                { key: 'other', nodes: [] },
              ],
            },
          ],
          format,
          labels,
        ),
      });
    }
    if (choice.numeric) {
      logicItems.push({
        id: `number:${valueName}`,
        label: valueLabel,
        group,
        description: intl.formatMessage(messages.byNumber),
        content: inlineContent(
          [
            presenceSwitch(valueName, [
              {
                kind: 'switch',
                argument: valueName,
                type: 'plural',
                versions: pluralCategories(locale).map((key) => ({
                  key,
                  nodes: [{ kind: 'count' }],
                })),
              },
            ]),
          ],
          format,
          labels,
        ),
      });
    }
  }

  const offeredTokens: RichTextEditorToken[] = [...choiceByName].flatMap(
    ([valueName, choice]) => {
      // A condition is only ever tested, never shown, so it has no pill;
      // an "If" written or removed then leaves the editor's pills as they
      // were.
      if (choice.kind === 'condition') return [];
      const label = naming.valueLabel(choice);
      return [
        { id: valueName, label, text: `{${valueName}}`, inToolbar: false },
        ...(choice.numeric
          ? [{ id: countTokenId(valueName), label, inToolbar: false }]
          : []),
      ];
    },
  );
  // A value the text already names that this place cannot offer now, such as
  // an attribute that was deleted or whose type has changed, keeps a pill,
  // so the editor still holds the text and an edit never drops its words.
  // The pill says what the value was, or that it was deleted
  // (`recordedLabel`), never the name the text uses for it.
  const unofferedTokens: RichTextEditorToken[] = (
    message === '' ? [] : dynamicValueNamesIn(message)
  )
    .filter(
      (valueName) =>
        !choiceByName.has(valueName) &&
        conditionIdOfName(valueName) === undefined,
    )
    .flatMap((valueName) => [
      {
        id: valueName,
        label: naming.recordedLabel(valueName),
        inToolbar: false,
      },
      {
        id: countTokenId(valueName),
        label: naming.recordedLabel(valueName),
        inToolbar: false,
      },
    ]);
  const tokens = [...offeredTokens, ...unofferedTokens];

  const insertMenu: RichTextInsertMenu = {
    label: intl.formatMessage(messages.insertMenu),
    items,
    trigger: '{',
  };
  const logicMenu: RichTextInsertMenu = {
    label: intl.formatMessage(messages.logicMenu),
    items: logicItems,
  };

  // What the document's pills and version labels say, so a renamed
  // attribute or answer relabels a document already open.
  const labelsKey = JSON.stringify(
    [...choiceByName].map(([valueName, choice]) => [
      valueName,
      naming.valueLabel(choice),
      choice.options.map((option) => labelText(option.label)),
    ]),
  ).concat(
    JSON.stringify([
      conditionValues,
      writesConditions,
      unofferedTokens.map((token) => token.label),
    ]),
  );

  const parsed = useMemo(
    () => openMessageDocument(name, message, format, labels),
    // The labels follow the language and the codebook's names
    // (`labelsKey`); the message decides the document.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [name, message, format, locale, intl, labelsKey],
  );

  // As `RichTextField` does: the editor gets its own last document back
  // while that document still writes the stored message, so a round trip
  // never rewrites what the researcher is typing.
  const lastEmitted = useRef<{
    message: string;
    content: RichTextContent;
    labelsKey: string;
  } | null>(null);
  const content =
    lastEmitted.current?.message === message &&
    lastEmitted.current.labelsKey === labelsKey
      ? lastEmitted.current.content
      : parsed;

  const handleChange = (next: unknown) => {
    if (typeof next !== 'object' || next === null) return;
    const document = next as RichTextContent;
    let nodes: MessageNode[];
    try {
      nodes = documentToMessageNodes(document, format);
    } catch {
      return;
    }
    const nextMessage = isBlankMessage(nodes)
      ? undefined
      : printMessageStructure(nodes);
    lastEmitted.current = {
      message: nextMessage ?? '',
      content: document,
      labelsKey,
    };
    if ((nextMessage ?? '') === message) return;

    // A condition the text no longer tests stays with the stage until it is
    // saved (see `withoutUnusedConditions`), so an "If" cut from one text
    // and pasted into another, or brought back by an undo, still has its
    // rules.
    onMessageChange(nextMessage);
  };

  const handleVersionsAction = (event: RichTextVersionsActionEvent) => {
    if (!writesConditions) return;
    if (event.action === ADD_ELSE_IF) {
      setEditing({ kind: 'elseIf', event });
      return;
    }
    const row =
      event.versionKey === undefined ? undefined : ifRowOf(event.versionKey);
    if (row === undefined) return;
    if (event.action === 'edit') {
      const conditionId = conditionIdOfName(row.argument);
      if (conditionId !== undefined) {
        setEditing({ kind: 'edit', conditionId, event });
      }
      return;
    }
    if (event.action === 'remove') {
      const { rows, otherwise } = ifBlockRowsIn(event.attributes);
      const kept = rows.filter(
        (each) => each.argument !== row.argument || each.key !== row.key,
      );
      // The last row goes only with the whole "If".
      if (kept.length === 0) return;
      event.update(ifBlockAttributes(kept, otherwise, ifBlock));
    }
  };

  const saveCondition = (condition: ConditionDraft) => {
    const session = editing;
    setEditing(null);
    if (session === null || setConditions === undefined) return;
    // The text is changed first and the stage after it. Changing the text
    // draws the editor at once, and a condition already written by then
    // would have this field hand the editor its old text back, relabelled,
    // in the middle of the edit.
    if (session.kind === 'edit') {
      const nextValues = {
        ...conditionValues,
        [session.conditionId]: condition,
      };
      // The rows say their rules, so the "If" in the text is relabelled.
      // The rules are kept with the stage and not in the text, so undoing in
      // the text cannot take them back: the new labels stay out of its
      // history, or an undo would show the old rules over the new ones.
      const { rows, otherwise } = ifBlockRowsIn(session.event.attributes);
      session.event.update(
        ifBlockAttributes(rows, otherwise, ifBlockFor(nextValues)),
        { undoable: false },
      );
      setConditions(nextValues);
      return;
    }
    const conditionId = createConditionId();
    const key =
      session.kind === 'insert' && session.negated ? FALSE_CASE : TRUE_CASE;
    const nextValues = { ...conditionValues, [conditionId]: condition };
    const block = ifBlockFor(nextValues);
    const added = {
      argument: dynamicValueNameFor({ kind: 'condition', conditionId }),
      key,
      content: [],
    };
    if (session.kind === 'elseIf') {
      const { rows, otherwise } = ifBlockRowsIn(session.event.attributes);
      session.event.update(
        ifBlockAttributes([...rows, added], otherwise, block),
      );
    } else {
      const attrs: RichTextVersionsAttributes = ifBlockAttributes(
        [added],
        [],
        block,
      );
      session.insert([{ type: 'versions', attrs }]);
    }
    setConditions(nextValues);
  };

  const editedCondition =
    editing?.kind === 'edit' &&
    Object.hasOwn(conditionValues, editing.conditionId)
      ? asConditionDraft(conditionValues[editing.conditionId])
      : NEW_CONDITION;

  const problem = useMemo(() => {
    if (!showsProblems || message === '') return undefined;
    return findSiteMessageProblem(message, context, locale);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [showsProblems, message, context, locale]);

  const toolbarOptions = markdown
    ? richTextToolbarFor(singleLine)
    : {
        bold: false,
        italic: false,
        links: false,
        headings: false,
        lists: false,
        thematicBreak: false,
        history: true,
      };

  return (
    <div className="flex flex-col gap-1">
      <RichTextEditorField
        id={id}
        name={name}
        aria-describedby={ariaDescribedBy}
        aria-labelledby={ariaLabelledBy}
        aria-invalid={ariaInvalid === true || problem !== undefined}
        aria-required={ariaRequired}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        readOnly={readOnly}
        singleLine={singleLine}
        changeMode="input"
        toolbarOptions={toolbarOptions}
        tokens={tokens}
        versions
        insertMenu={insertMenu}
        {...(logicItems.length > 0 && { logicMenu })}
        {...(assetBlocks !== undefined && { assetBlocks })}
        onVersionsAction={handleVersionsAction}
        value={content ?? { type: 'doc', content: [{ type: 'paragraph' }] }}
        onChange={handleChange}
        className={className}
      />
      {problem !== undefined && (
        <output aria-live="polite" className="text-destructive block text-sm">
          {problem}
        </output>
      )}
      {editing !== null && (
        <ConditionDialog
          open
          title={intl.formatMessage(
            editing.kind === 'edit'
              ? messages.editIfTitle
              : messages.newIfTitle,
          )}
          condition={editedCondition}
          aboutChoices={aboutChoices}
          codebook={site.conditions?.codebook}
          subject={site.conditions?.subject}
          allowEgoRules={allowEgoRules}
          onSave={saveCondition}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** The first of the private-use characters that hold a value's place. */
const VALUE_MARK = 0xf0000;

/** The property a value's place is recorded under once markdown is read. */
const VALUE_PROPERTY = 'dataDynamicValue';

/**
 * Splits the text the markdown was read into at each character holding a
 * value's place, leaving an empty `span` that records which value it is. Runs
 * on the finished structure, where an author's words are text only, so
 * nothing an author wrote can claim to be a value.
 */
const splitValueMarks = (node: unknown): void => {
  if (!isRecord(node) || !Array.isArray(node.children)) return;
  node.children = node.children.flatMap((child: unknown): unknown[] => {
    if (
      !isRecord(child) ||
      child.type !== 'text' ||
      typeof child.value !== 'string'
    ) {
      splitValueMarks(child);
      return [child];
    }
    const parts: unknown[] = [];
    let text = '';
    for (const character of child.value) {
      const index = (character.codePointAt(0) ?? 0) - VALUE_MARK;
      if (index < 0) {
        text += character;
        continue;
      }
      if (text !== '') parts.push({ type: 'text', value: text });
      text = '';
      parts.push({
        type: 'element',
        tagName: 'span',
        properties: { [VALUE_PROPERTY]: String(index) },
        children: [],
      });
    }
    if (text !== '') parts.push({ type: 'text', value: text });
    return parts;
  });
};

const valueMarkPlugin = () => splitValueMarks;
const SUMMARY_REHYPE_PLUGINS = [valueMarkPlugin];

/**
 * How markdown spread over several lines is drawn: which elements it keeps
 * and how it draws them. A host with rules of its own, such as a table cell
 * that draws headings as bold lines, passes its own.
 */
export type BlockMarkdown = Readonly<{
  allowedElements: readonly string[];
  components?: ComponentProps<typeof RenderMarkdown>['components'];
  /** How a file the text holds as a block is drawn; without it, it is not. */
  blockImages?: ComponentProps<typeof RenderMarkdown>['blockImages'];
}>;

const SECTION_MARKDOWN: BlockMarkdown = {
  allowedElements: markdownElementsFor(false),
};
const LABEL_MARKDOWN: BlockMarkdown = {
  allowedElements: markdownElementsFor(true),
};

/**
 * How a summary draws the value its markdown marked with a character of its
 * own, by that character's position among the message's values.
 *
 * Read through a context so the span component below can be defined once, at
 * module level: a component written inline in the render is a new type each
 * time, and React would unmount and remount every pill on every render.
 */
const SummaryValueContext = createContext<(index: number) => ReactNode>(
  () => undefined,
);

/** The span markdown wraps a marked value in, drawn as its pill. */
function SummaryValueSpan({
  node,
  children,
}: Readonly<{
  node?: { properties?: Record<string, unknown> } | undefined;
  children?: ReactNode;
}>) {
  const shownValue = useContext(SummaryValueContext);
  const index = node?.properties?.[VALUE_PROPERTY];
  if (typeof index !== 'string') return <span>{children}</span>;
  // A character past the values is the author's own, kept as is.
  return (
    shownValue(Number(index)) ??
    String.fromCodePoint(VALUE_MARK + Number(index))
  );
}

/**
 * The one set of versions a message is made of, with nothing but whitespace
 * around it, or undefined when it is anything else.
 */
const wholeSwitch = (
  nodes: readonly MessageNode[],
): MessageSwitch | undefined => {
  const only = nodes.filter(
    (node) => !(node.kind === 'text' && node.text.trim() === ''),
  );
  const [one] = only;
  return only.length === 1 && one?.kind === 'switch' ? one : undefined;
};

/**
 * A message's words, read-only, each value as the pill an editor shows and
 * each set of versions folded to the pill of the value it is on, as the
 * editor shows it folded: what it says in each case is written, and read, in
 * the editor.
 */
export function MessageNodesSummary({
  nodes,
  markdown,
  multiline,
  blockMarkdown = SECTION_MARKDOWN,
  valueLabel,
  switchSummary,
  versionLabel,
}: Readonly<{
  nodes: readonly MessageNode[];
  /** Whether the words are markdown, drawn here with their formatting. */
  markdown: boolean;
  /**
   * Whether the text's field holds several lines, as a field on one line
   * never does: a property of the field, not of the words it holds today.
   */
  multiline: boolean;
  /**
   * How markdown in a field of several lines (an Information screen's text)
   * draws its paragraphs, headings, rules and files; text on one line keeps
   * only inline formatting and lists, as a label does.
   */
  blockMarkdown?: BlockMarkdown;
  /** What a value's pill says, by the name the message gives it. */
  valueLabel: (argument: string) => TokenPillLabel;
  /** What a set of versions' pill says. */
  switchSummary: (node: MessageSwitch) => TokenPillLabel;
  /**
   * What a version of a set is called, for a set that is the whole of the
   * message, or of one version of it: that set is written out, one labelled
   * line for each version, instead of being folded to a pill, as the editor
   * lists it open. A set among words is a pill either way. Without this,
   * every set is a pill.
   */
  versionLabel?: (node: MessageSwitch, key: string) => string;
}>) {
  const elements = multiline ? blockMarkdown : LABEL_MARKDOWN;
  const allowedElements = [...elements.allowedElements, 'span'];
  const labelLanguage = useTokenPillLanguage();

  const renderSwitch = (node: MessageSwitch, key: number): ReactNode => (
    <TokenPill key={key} token={node.argument} label={switchSummary(node)} />
  );

  // The words of one level of the message, each value and each set of
  // versions held by a character of its own. Markdown is read as a whole, so
  // formatting that spans a value or a set of versions
  // (`**Hi {name, select, …} today**`) is read as written.
  function render(
    levelNodes: readonly MessageNode[],
    plural: string | undefined,
  ): ReactNode {
    const whole =
      versionLabel === undefined ? undefined : wholeSwitch(levelNodes);
    if (whole !== undefined && versionLabel !== undefined) {
      return (
        <span data-versions-summary="" className="flex flex-col gap-1.5">
          {whole.versions.map((version) => (
            <span
              key={version.key}
              data-version-summary={version.key}
              className="flex flex-col"
            >
              {/* The interface's words, inside the protocol's text. */}
              <span
                {...labelLanguage}
                className="text-xs font-semibold text-current/70"
              >
                {versionLabel(whole, version.key)}
              </span>
              <span
                className={
                  wholeSwitch(version.nodes)
                    ? 'border-s border-current/20 ps-3'
                    : undefined
                }
              >
                {render(
                  version.nodes,
                  whole.type === 'plural' ? whole.argument : undefined,
                )}
              </span>
            </span>
          ))}
        </span>
      );
    }
    const held: (string | MessageSwitch)[] = [];
    let source = '';
    for (const node of levelNodes) {
      if (node.kind === 'text') {
        source += node.text;
      } else if (node.kind === 'count' && plural === undefined) {
        source += '#';
      } else {
        source += String.fromCodePoint(VALUE_MARK + held.length);
        held.push(
          node.kind === 'switch'
            ? node
            : node.kind === 'argument'
              ? node.name
              : (plural ?? ''),
        );
      }
    }
    const shown = (index: number, at: number): ReactNode => {
      const piece = held[index];
      if (piece === undefined) return undefined;
      return typeof piece === 'string' ? (
        <TokenPill key={at} token={piece} label={valueLabel(piece)} />
      ) : (
        renderSwitch(piece, at)
      );
    };
    if (markdown) {
      return (
        <SummaryValueContext value={(index) => shown(index, 0)}>
          <RenderMarkdown
            allowedElements={allowedElements}
            rehypePlugins={SUMMARY_REHYPE_PLUGINS}
            components={{ ...elements.components, span: SummaryValueSpan }}
            blockImages={elements.blockImages}
          >
            {source}
          </RenderMarkdown>
        </SummaryValueContext>
      );
    }
    return Array.from(source).map(
      (character, index) =>
        shown((character.codePointAt(0) ?? 0) - VALUE_MARK, index) ?? character,
    );
  }

  return <>{render(nodes, undefined)}</>;
}

/**
 * One translation of text with values, read-only, for a place that shows
 * text rather than editing it (a cell of the translation table): its words,
 * with each value and each set of versions as a pill (see
 * `MessageNodesSummary`).
 */
export function DynamicMessageSummary({
  message,
  markdown,
  multiline,
  locale,
  site,
  blockMarkdown,
}: Readonly<{
  message: string;
  /** Whether the words are markdown, drawn here with their formatting. */
  markdown: boolean;
  /**
   * Whether the text's field holds several lines, so that its markdown is
   * drawn with its blocks (see `MessageNodesSummary`), as its editor draws
   * them. A property of the field, not of the text it holds today: a page
   * that is one file and nothing else is still a page.
   */
  multiline: boolean;
  /** How markdown with blocks is drawn (see `MessageNodesSummary`). */
  blockMarkdown?: BlockMarkdown;
  locale: LocaleTag;
  site: Pick<DynamicMessageSite, 'context' | 'conditions'>;
}>) {
  const intl = useAppIntl();
  const { localization } = useEditingLanguage();
  const { context } = site;
  const structure = messageStructure(message);
  if (!('nodes' in structure)) return <>{message}</>;

  const labelText = (label: unknown): string =>
    label === undefined
      ? ''
      : resolveTranslation(label, localization, locale).text;
  const naming = namingFor(intl, {
    context,
    codebook: site.conditions?.codebook,
    conditions: site.conditions?.values,
    labelText,
  });
  const choiceByName = new Map<string, DynamicValueChoice>(
    dynamicValueChoices(context).map((choice) => [choice.name, choice]),
  );
  const labels = messageLabelsFor({
    intl,
    naming,
    choiceByName,
    locale,
    labelText,
  });
  const valueLabel = (argument: string) => {
    const choice = choiceByName.get(argument);
    return choice === undefined
      ? naming.recordedLabel(argument)
      : naming.valueLabel(choice);
  };

  return (
    <MessageNodesSummary
      nodes={structure.nodes}
      markdown={markdown}
      multiline={multiline}
      blockMarkdown={blockMarkdown}
      valueLabel={valueLabel}
      switchSummary={labels.switchSummary}
    />
  );
}

/**
 * `message` as a message that shows no values: each value, and each set of
 * versions, written as the name its pill shows, in brackets. For text a
 * preview hands to a control that takes only words (a scale's end labels),
 * which has no participant to fill a value in with.
 */
export const messageWithValueNames = (
  message: string,
  nameOf: (argument: string) => string,
): string => {
  const structure = messageStructure(message);
  if (!('nodes' in structure)) return message;
  const write = (
    nodes: readonly MessageNode[],
    plural: string | undefined,
  ): string =>
    nodes
      .map((node) => {
        switch (node.kind) {
          case 'text':
            return node.text;
          case 'argument':
            return `[${nameOf(node.name)}]`;
          case 'count':
            return plural === undefined ? '#' : `[${nameOf(plural)}]`;
          case 'switch':
            return `[${nameOf(node.argument)}]`;
          default: {
            const unhandled: never = node;
            throw new Error('Unhandled message node', { cause: unhandled });
          }
        }
      })
      .join('');
  return escapeMessageText(write(structure.nodes, undefined));
};

/** The name each value text at `site` can show is shown as, by its name in the text. */
export function useDynamicValueNames(
  site: Pick<DynamicMessageSite, 'context' | 'conditions'>,
): (argument: string) => string {
  const intl = useAppIntl();
  const { context } = site;
  const codebook = site.conditions?.codebook;
  const conditions = site.conditions?.values;
  return useMemo(() => {
    const naming = namingFor(intl, { context, codebook, conditions });
    const choiceByName = new Map<string, DynamicValueChoice>(
      dynamicValueChoices(context).map((choice) => [choice.name, choice]),
    );
    return (argument: string) => {
      const choice = choiceByName.get(argument);
      // Written into the preview's text, so the words alone.
      return presentationalTextValue(
        choice === undefined
          ? naming.recordedLabel(argument)
          : naming.valueLabel(choice),
      );
    };
  }, [intl, context, codebook, conditions]);
}

export type DynamicTextFieldProps = CreateFormFieldProps<
  LocalizedString,
  'div',
  {
    'id': string;
    'name': string;
    'aria-describedby': string;
    /** Where the text sits, which decides what it can show. */
    'dynamicValues': DynamicValueSite;
    /**
     * Where the text sits in the row a dialog edits, for a form field's
     * caption (such as `['prompt']`): which fields come before it decides
     * which answers it can show.
     */
    'fieldPath'?: readonly string[];
    /**
     * What the text may hold, as its field declares it (see
     * `markdownTextShapeAt`); one plain line when absent.
     */
    'shape'?: LocalizedTextShape;
    'placeholder'?: string;
    'autoFocus'?: boolean;
    'hideUntranslatedNote'?: boolean;
  }
>;

/**
 * Text a participant reads, in each of the protocol's languages, that can
 * show values the interview fills in: the participant's answers, the people
 * a question is about, today's date. What it can show depends on where it
 * sits (`dynamicValues`), by the same rules the protocol is validated by.
 * The text names each value by its id, and shows it as a pill labelled with
 * the attribute's name.
 */
export default function DynamicTextField({
  id,
  name,
  value,
  onChange,
  disabled,
  readOnly,
  'dynamicValues': siteKind,
  fieldPath,
  shape = PLAIN_LINE,
  placeholder,
  autoFocus,
  hideUntranslatedNote,
  'aria-describedby': ariaDescribedBy,
  'aria-labelledby': ariaLabelledBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
}: DynamicTextFieldProps) {
  const site = useDynamicValueSite(siteKind, fieldPath);
  const {
    markdown,
    singleLine,
    assetBlocks: holdsAssetBlocks,
  } = textFieldPropsFor(shape);
  const { localization, locale } = useEditingLanguage();
  const defaultLocale = localization?.defaultLocale;

  return (
    <StageAssetBlocks enabled={holdsAssetBlocks}>
      {(assetBlocks) => (
        <LocalizedStringField
          value={value}
          onChange={onChange}
          hideUntranslatedNote={hideUntranslatedNote}
        >
          {(translation) => (
            <DynamicMessageEditor
              id={id}
              name={name}
              ariaDescribedBy={ariaDescribedBy}
              ariaLabelledBy={ariaLabelledBy}
              ariaInvalid={ariaInvalid}
              ariaRequired={ariaRequired === true}
              placeholder={placeholder}
              autoFocus={autoFocus}
              disabled={disabled}
              readOnly={readOnly === true || translation.readOnly}
              markdown={markdown}
              singleLine={singleLine}
              {...(assetBlocks !== undefined && { assetBlocks })}
              message={translation.message}
              onMessageChange={translation.onMessageChange}
              locale={locale ?? defaultLocale ?? 'en'}
              site={site}
              showsProblems={site.codebookRead}
            />
          )}
        </LocalizedStringField>
      )}
    </StageAssetBlocks>
  );
}
