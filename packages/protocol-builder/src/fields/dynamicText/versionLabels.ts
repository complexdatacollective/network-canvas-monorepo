import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';
import {
  isPluralCategory,
  type LocaleTag,
  pluralValueExamples,
} from '@codaco/protocol-validation';

import {
  type LogicBlockMeta,
  type ConditionVersionMeta,
  MISSING_VERSION,
  OTHERWISE_VERSION,
  PARTICIPANT_VERSION,
} from '../../localization/messageDocument.ts';
import { participantVersionMessages } from '../messageArgumentLabels.ts';
import { type ValueNaming, valueNamingMessages } from './valueNaming.ts';

export const versionLabelMessages = defineMessages({
  ifRow: {
    id: 'protocolBuilder.dynamicText.ifRow',
    defaultMessage: 'If: {rules}',
    description:
      'Label of the first version of a dynamic attribute or a logic block with “If” logic: the version shown when its rules are met. rules is those rules as a phrase, such as “Age is more than 30” or “Friend exists and Close is true”.',
  },
  ifNotRow: {
    id: 'protocolBuilder.dynamicText.ifNotRow',
    defaultMessage: 'If not: {rules}',
    description:
      'Label of the first version of a dynamic attribute or a logic block with “If not” logic: the version shown when its rules are NOT met. rules is those rules as a phrase, such as “Age is more than 30”.',
  },
  elseIfRow: {
    id: 'protocolBuilder.dynamicText.elseIfRow',
    defaultMessage: 'Else if: {rules}',
    description:
      'Label of a later version of a dynamic attribute or a logic block with “If” logic: the version shown when the versions above did not apply and these rules are met. rules is those rules as a phrase, such as “Age is more than 30”.',
  },
  elseIfNotRow: {
    id: 'protocolBuilder.dynamicText.elseIfNotRow',
    defaultMessage: 'Else if not: {rules}',
    description:
      'Label of a later version of a dynamic attribute or a logic block with “If” logic: the version shown when the versions above did not apply and these rules are NOT met. rules is those rules as a phrase.',
  },
  noRules: {
    id: 'protocolBuilder.dynamicText.noRules',
    defaultMessage: '(no rules yet)',
    description:
      'Stands in for the rules of an “If” when it has none yet, in a label such as “If: (no rules yet)”.',
  },
  otherwise: {
    id: 'protocolBuilder.dynamicText.versionOtherwise',
    defaultMessage: 'Otherwise',
    description:
      'Label of the last version of a dynamic attribute or a logic block with “If” logic: the version shown when none of the versions above applied.',
  },
  missing: {
    id: 'protocolBuilder.dynamicText.versionMissing',
    defaultMessage: 'If not known',
    description:
      'Label of the version of a dynamic attribute or a logic block that is shown when the attribute that it depends on has no answer, such as a question the participant skipped.',
  },
  otherAnswer: {
    id: 'protocolBuilder.dynamicText.versionOtherAnswer',
    defaultMessage: 'Any other answer',
    description:
      'Label of the version of a dynamic attribute or a logic block that is shown for an answer that has no version of its own.',
  },
  numbers: {
    id: 'protocolBuilder.dynamicText.versionNumbers',
    defaultMessage: 'When it is {numbers}',
    description:
      'Label of the version of a logic block that is shown for some numbers. numbers lists examples of those numbers, in the language being edited, such as “1” or “0, 2, 3, …”.',
  },
});

/** How many examples a number version's label gives. */
const EXAMPLE_COUNT = 3;

/** “When it is 1”, “When it is 0, 2, 3, …”: a plural category's numbers. */
const numberVersionLabel = (
  intl: IntlShape,
  locale: LocaleTag,
  category: string,
): string => {
  const counts =
    [...pluralValueExamples(locale)].find(([key]) => key === category)?.[1] ??
    [];
  const shown = counts
    .slice(0, EXAMPLE_COUNT)
    .map((count) => intl.formatNumber(count));
  return intl.formatMessage(versionLabelMessages.numbers, {
    numbers: intl.formatList(
      counts.length > EXAMPLE_COUNT ? [...shown, '…'] : shown,
      { type: 'unit', style: 'short' },
    ),
  });
};

/** What labels a condition version needs: its rules as a phrase. */
type ConditionLabelSources = Readonly<{
  intl: IntlShape;
  /** The condition's rules as one phrase; empty for one with no rules. */
  conditionSentence: (conditionId: string) => string;
  /** Whether a condition is still declared beside the text. */
  hasCondition: (conditionId: string) => boolean;
}>;

/** “If: …”, “Else if not: …”: the label of the condition version at `index`. */
const conditionVersionLabel = (
  { intl, conditionSentence, hasCondition }: ConditionLabelSources,
  conditionVersion: ConditionVersionMeta,
  index: number,
): string => {
  const sentence = hasCondition(conditionVersion.conditionId)
    ? conditionSentence(conditionVersion.conditionId)
    : intl.formatMessage(valueNamingMessages.deletedCondition);
  const rules =
    sentence === ''
      ? intl.formatMessage(versionLabelMessages.noRules)
      : sentence;
  const message =
    conditionVersion.when === 'notMet'
      ? index === 0
        ? versionLabelMessages.ifNotRow
        : versionLabelMessages.elseIfNotRow
      : index === 0
        ? versionLabelMessages.ifRow
        : versionLabelMessages.elseIfRow;
  return intl.formatMessage(message, { rules });
};

export type VersionLabelSources = ConditionLabelSources &
  Readonly<{ naming: ValueNaming; locale: LocaleTag }>;

/**
 * What a branch of a logic block (or a version of a dynamic attribute) is
 * called: its rules, an answer, “If not known”, “Any other answer”, the
 * numbers it is for, “The participant” or “Someone else”.
 */
export const logicVersionLabel = (
  sources: VersionLabelSources,
  meta: LogicBlockMeta,
  key: string,
  conditionVersion: ConditionVersionMeta | undefined,
  versionIndex: number,
): string => {
  const { intl, naming, locale } = sources;
  if (key === MISSING_VERSION)
    return intl.formatMessage(versionLabelMessages.missing);
  switch (meta.kind) {
    case 'conditions':
      return conditionVersion === undefined || key === OTHERWISE_VERSION
        ? intl.formatMessage(versionLabelMessages.otherwise)
        : conditionVersionLabel(sources, conditionVersion, versionIndex);
    case 'answers':
      return key === OTHERWISE_VERSION
        ? intl.formatMessage(versionLabelMessages.otherAnswer)
        : (naming.answerLabel(meta.value, key) ?? key);
    case 'number':
      return isPluralCategory(key)
        ? numberVersionLabel(intl, locale, key)
        : key;
    case 'participant':
    default:
      return intl.formatMessage(
        key === PARTICIPANT_VERSION
          ? participantVersionMessages.aboutParticipant
          : participantVersionMessages.aboutSomeoneElse,
      );
  }
};

/**
 * How many examples a plural version's label gives of the numbers it is for.
 */
const NUMBER_EXAMPLE_COUNT = 3;

/**
 * What a switch on a number is called, and each of its versions: examples
 * of the numbers it is for, in `locale`.
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
      .slice(0, NUMBER_EXAMPLE_COUNT)
      .map((count) => intl.formatNumber(count));
    return intl.formatMessage(versionLabelMessages.numbers, {
      numbers: intl.formatList(
        counts.length > NUMBER_EXAMPLE_COUNT ? [...shown, '…'] : shown,
        { type: 'unit', style: 'short' },
      ),
    });
  },
});
