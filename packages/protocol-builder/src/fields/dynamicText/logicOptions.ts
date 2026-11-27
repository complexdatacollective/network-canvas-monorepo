import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';

import type { DynamicValueChoice } from '../../localization/dynamicValueCatalog.ts';

/**
 * The logic a dynamic attribute or a logic block can have, as the Logic
 * control lists it. `if` and `ifNot` are both `conditions`, with the first
 * row's rules met or not met.
 */
export type LogicOption = 'if' | 'ifNot' | 'answers' | 'number' | 'participant';

export const LOGIC_OPTIONS: readonly LogicOption[] = [
  'if',
  'ifNot',
  'answers',
  'number',
  'participant',
];

/** What the logic chooses: a word or phrase in a sentence, or content. */
type LogicSubject = 'wording' | 'content';

export const logicMessages = defineMessages({
  logicLabel: {
    id: 'protocolBuilder.logic.logicLabel',
    defaultMessage: 'Logic',
    description:
      'Label of the control where a researcher chooses how a dynamic attribute or a logic block chooses which version to show: by rules, by the answer to an attribute, by a number, or by whether a person is the participant.',
  },
  if: {
    id: 'protocolBuilder.dynamicText.logicIf',
    defaultMessage: 'If … else',
    description:
      'Choice of logic for a dynamic attribute or a logic block: one version is shown when rules that the researcher sets are met, and another version otherwise. The ellipsis stands for the rules.',
  },
  ifNot: {
    id: 'protocolBuilder.dynamicText.logicIfNot',
    defaultMessage: 'If not … else',
    description:
      'Choice of logic for a dynamic attribute or a logic block: one version is shown when rules that the researcher sets are NOT met, and another version otherwise. The ellipsis stands for the rules.',
  },
  answersWording: {
    id: 'protocolBuilder.dynamicText.byAnswer',
    defaultMessage: 'Different wording for each answer',
    description:
      'Choice of logic for a dynamic attribute (a short word or phrase in a sentence that changes): one version of the wording for each answer to a categorical, ordinal or Boolean attribute.',
  },
  answersContent: {
    id: 'protocolBuilder.logic.answersContent',
    defaultMessage: 'Different content for each answer',
    description:
      'Choice of logic for a logic block (a part of a page or form that changes): one version of the content for each answer to a categorical, ordinal or Boolean attribute.',
  },
  numberWording: {
    id: 'protocolBuilder.logic.numberWording',
    defaultMessage: 'Wording for singular or plural numbers',
    description:
      'Choice of logic for a dynamic attribute: wording that suits the number in an attribute, such as “1 child” or “3 children”.',
  },
  numberContent: {
    id: 'protocolBuilder.logic.numberContent',
    defaultMessage: 'Content for singular or plural numbers',
    description:
      'Choice of logic for a logic block: content that suits the number in an attribute, with one version for each number form that the language distinguishes.',
  },
  participant: {
    id: 'protocolBuilder.logic.participant',
    defaultMessage: 'Participant or someone else',
    description:
      'Choice of logic for a dynamic attribute or a logic block on the form of a Family Pedigree: one version when the family member that the form asks about is the participant, and another for everyone else.',
  },
  ifWordingDescription: {
    id: 'protocolBuilder.logic.ifWordingDescription',
    defaultMessage:
      'One version of the wording when the rules that you set are met, and another version otherwise.',
    description:
      'Explains the “If … else” logic of a dynamic attribute, under the Logic control.',
  },
  ifContentDescription: {
    id: 'protocolBuilder.logic.ifContentDescription',
    defaultMessage:
      'One version of the content when the rules that you set are met, and another version otherwise.',
    description:
      'Explains the “If … else” logic of a logic block, under the Logic control.',
  },
  ifNotWordingDescription: {
    id: 'protocolBuilder.logic.ifNotWordingDescription',
    defaultMessage:
      'One version of the wording when the rules that you set are not met, and another version otherwise.',
    description:
      'Explains the “If not … else” logic of a dynamic attribute, under the Logic control.',
  },
  ifNotContentDescription: {
    id: 'protocolBuilder.logic.ifNotContentDescription',
    defaultMessage:
      'One version of the content when the rules that you set are not met, and another version otherwise.',
    description:
      'Explains the “If not … else” logic of a logic block, under the Logic control.',
  },
  answersDescription: {
    id: 'protocolBuilder.logic.answersDescription',
    defaultMessage:
      'One version for each answer to a categorical, ordinal or Boolean attribute.',
    description:
      'Explains the logic that gives one version for each answer to an attribute, under the Logic control of a dynamic attribute or a logic block.',
  },
  numberDescription: {
    id: 'protocolBuilder.logic.numberDescription',
    defaultMessage:
      'One version for each number form that the language distinguishes, such as “1 child” and “3 children”.',
    description:
      'Explains the logic that gives one version for each plural form of a number, under the Logic control of a dynamic attribute or a logic block.',
  },
  participantWordingDescription: {
    id: 'protocolBuilder.logic.participantWordingDescription',
    defaultMessage:
      'Different wording for the participant and for everyone else.',
    description:
      'Explains the “Participant or someone else” logic of a dynamic attribute, under the Logic control.',
  },
  participantContentDescription: {
    id: 'protocolBuilder.logic.participantContentDescription',
    defaultMessage:
      'Different content for the participant and for everyone else.',
    description:
      'Explains the “Participant or someone else” logic of a logic block, under the Logic control.',
  },
  participantUnavailable: {
    id: 'protocolBuilder.logic.participantUnavailable',
    defaultMessage: 'Only in the form of a Family Pedigree.',
    description:
      'Why the “Participant or someone else” logic cannot be chosen here: it is only available in the form of a Family Pedigree stage, which asks about each family member, one of whom is the participant.',
  },
  noRulesUnavailable: {
    id: 'protocolBuilder.logic.noRulesUnavailable',
    defaultMessage: 'There is nothing here that rules can be about.',
    description:
      'Why the “If … else” logic cannot be chosen for a piece of text: the text is shown where there is no participant or node that a rule could ask about.',
  },
  noAnswersUnavailable: {
    id: 'protocolBuilder.logic.noAnswersUnavailable',
    defaultMessage:
      'No categorical, ordinal or Boolean attribute can be used here.',
    description:
      'Why the logic that gives one version for each answer cannot be chosen: no attribute with a fixed set of answers is available where the text is shown.',
  },
  noNumbersUnavailable: {
    id: 'protocolBuilder.logic.noNumbersUnavailable',
    defaultMessage: 'No number attribute can be used here.',
    description:
      'Why the logic for singular or plural numbers cannot be chosen: no number attribute is available where the text is shown.',
  },
});

/** What the Logic control calls `option`, for wording or for content. */
export const logicOptionLabel = (
  intl: IntlShape,
  option: LogicOption,
  subject: LogicSubject,
): string => {
  switch (option) {
    case 'if':
      return intl.formatMessage(logicMessages.if);
    case 'ifNot':
      return intl.formatMessage(logicMessages.ifNot);
    case 'answers':
      return intl.formatMessage(
        subject === 'wording'
          ? logicMessages.answersWording
          : logicMessages.answersContent,
      );
    case 'number':
      return intl.formatMessage(
        subject === 'wording'
          ? logicMessages.numberWording
          : logicMessages.numberContent,
      );
    case 'participant':
    default:
      return intl.formatMessage(logicMessages.participant);
  }
};

/** The sentence under the Logic control that explains `option`. */
export const logicOptionDescription = (
  intl: IntlShape,
  option: LogicOption,
  subject: LogicSubject,
): string => {
  const wording = subject === 'wording';
  switch (option) {
    case 'if':
      return intl.formatMessage(
        wording
          ? logicMessages.ifWordingDescription
          : logicMessages.ifContentDescription,
      );
    case 'ifNot':
      return intl.formatMessage(
        wording
          ? logicMessages.ifNotWordingDescription
          : logicMessages.ifNotContentDescription,
      );
    case 'answers':
      return intl.formatMessage(logicMessages.answersDescription);
    case 'number':
      return intl.formatMessage(logicMessages.numberDescription);
    case 'participant':
    default:
      return intl.formatMessage(
        wording
          ? logicMessages.participantWordingDescription
          : logicMessages.participantContentDescription,
      );
  }
};

/** What decides which logic options a place can have. */
type LogicAvailabilityInputs = Readonly<{
  /** Whether conditions can be written here (see `writesConditions`). */
  writesConditions: boolean;
  /** What text here can show. */
  choices: readonly DynamicValueChoice[];
}>;

/** The attributes whose answers text here can choose by. */
export const answerChoices = (
  choices: readonly DynamicValueChoice[],
): DynamicValueChoice[] =>
  choices.filter(
    (choice) => choice.kind === 'attribute' && choice.options.length > 0,
  );

/** The number attributes text here can choose by. */
export const numberChoices = (
  choices: readonly DynamicValueChoice[],
): DynamicValueChoice[] =>
  choices.filter((choice) => choice.kind === 'attribute' && choice.numeric);

/**
 * Why `option` cannot be chosen here, as a sentence, or undefined when it
 * can (see DESIGN §1.3: the same rules for dynamic attributes and logic
 * blocks).
 */
export const logicOptionUnavailableReason = (
  intl: IntlShape,
  option: LogicOption,
  { writesConditions, choices }: LogicAvailabilityInputs,
): string | undefined => {
  switch (option) {
    case 'if':
    case 'ifNot':
      return writesConditions
        ? undefined
        : intl.formatMessage(logicMessages.noRulesUnavailable);
    case 'answers':
      return answerChoices(choices).length > 0
        ? undefined
        : intl.formatMessage(logicMessages.noAnswersUnavailable);
    case 'number':
      return numberChoices(choices).length > 0
        ? undefined
        : intl.formatMessage(logicMessages.noNumbersUnavailable);
    case 'participant':
    default:
      return choices.some((choice) => choice.kind === 'participant')
        ? undefined
        : intl.formatMessage(logicMessages.participantUnavailable);
  }
};

/** The first option that can be chosen here, for something new. */
export const firstAvailableLogicOption = (
  intl: IntlShape,
  inputs: LogicAvailabilityInputs,
): LogicOption | undefined =>
  LOGIC_OPTIONS.find(
    (option) =>
      logicOptionUnavailableReason(intl, option, inputs) === undefined,
  );

export const isLogicOption = (value: unknown): value is LogicOption =>
  LOGIC_OPTIONS.some((option) => option === value);
