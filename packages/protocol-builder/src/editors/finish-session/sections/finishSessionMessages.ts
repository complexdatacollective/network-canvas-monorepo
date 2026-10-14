import {
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import type { FinishMode, FinishOutcome } from '@codaco/protocol-validation';

/**
 * Everything the finish stage editor says.
 *
 * A finish stage is the screen that ends the interview. In confirmation mode
 * the participant reads its closing text and finishes the interview from it;
 * in automatic mode the interview finishes on arrival. Either way the
 * participant then reads its finished text. Its outcome
 * records how an interview that ended there ended; the participant never sees
 * it.
 */
export const finishSessionMessages = defineMessages({
  modeTitle: {
    id: 'protocolBuilder.finishSession.modeTitle',
    defaultMessage: 'How participants finish',
    description:
      'Heading of the section where a researcher chooses whether participants confirm that they are finished, or the interview finishes as soon as they reach the screen that ends it.',
  },
  modeDescription: {
    id: 'protocolBuilder.finishSession.modeDescription',
    defaultMessage:
      'Choose whether participants confirm that they are finished, or the interview finishes as soon as they reach this screen.',
    description: 'Description of the section choosing how participants finish.',
  },
  modeLabel: {
    id: 'protocolBuilder.finishSession.modeLabel',
    defaultMessage: 'Finishing',
    description:
      'Label of the choice between confirming the end of the interview and finishing it automatically.',
  },
  modeConfirmation: {
    id: 'protocolBuilder.finishSession.modeConfirmation',
    defaultMessage: 'Participants confirm',
    description:
      'Option: participants read a closing screen, press a button to finish the interview and confirm in a dialog.',
  },
  modeConfirmationDescription: {
    id: 'protocolBuilder.finishSession.modeConfirmationDescription',
    defaultMessage:
      'Participants read the closing screen, press a button to finish and confirm when asked. Until then they can go back and change their answers.',
    description: 'Explanation under the "Participants confirm" option.',
  },
  modeAutomatic: {
    id: 'protocolBuilder.finishSession.modeAutomatic',
    defaultMessage: 'Finish automatically',
    description:
      'Option: the interview finishes as soon as participants reach this screen, with no closing screen, button or question.',
  },
  modeAutomaticDescription: {
    id: 'protocolBuilder.finishSession.modeAutomaticDescription',
    defaultMessage:
      'The interview finishes as soon as participants reach this screen, and they can’t go back.',
    description: 'Explanation under the "Finish automatically" option.',
  },
  closingTitle: {
    id: 'protocolBuilder.finishSession.closingTitle',
    defaultMessage: 'Closing screen',
    description:
      'Heading of the section where a researcher writes what a participant reads before finishing the interview.',
  },
  closingScreenDescription: {
    id: 'protocolBuilder.finishSession.closingScreenDescription',
    defaultMessage:
      'Write what participants read before they finish the interview. Start it with a heading.',
    description: 'Description of the closing-screen section.',
  },
  closingTextLabel: {
    id: 'protocolBuilder.finishSession.closingTextLabel',
    defaultMessage: 'Closing text',
    description:
      'Label of the field holding the text, heading included, a participant reads before finishing the interview.',
  },
  finishedTitle: {
    id: 'protocolBuilder.finishSession.finishedTitle',
    defaultMessage: 'Finished screen',
    description:
      'Heading of the section where a researcher writes what a participant reads once the interview has finished.',
  },
  finishedDescription: {
    id: 'protocolBuilder.finishSession.finishedDescription',
    defaultMessage:
      'Write what participants read once the interview has finished. They see it again whenever the finished interview is opened.',
    description: 'Description of the finished-screen section.',
  },
  finishedTextLabel: {
    id: 'protocolBuilder.finishSession.finishedTextLabel',
    defaultMessage: 'Finished text',
    description:
      'Label of the field holding the text, heading included, a participant reads once the interview has finished.',
  },
  finishingTitle: {
    id: 'protocolBuilder.finishSession.finishingTitle',
    defaultMessage: 'Finishing the interview',
    description:
      'Heading of the section holding the words a participant sees while finishing the interview: the button, its confirmation question, and the message when finishing fails.',
  },
  finishingDescription: {
    id: 'protocolBuilder.finishSession.finishingDescription',
    defaultMessage:
      'These start with wording Network Canvas supplies, which you can change.',
    description:
      'Description of the finishing section. Each field starts with supplied wording in each of the protocol’s languages that Network Canvas has it in.',
  },
  finishLabelLabel: {
    id: 'protocolBuilder.finishSession.finishLabelLabel',
    defaultMessage: 'Finish button',
    description:
      'Label of the field holding the words on the button that ends the interview.',
  },
  finishConfirmationLabel: {
    id: 'protocolBuilder.finishSession.finishConfirmationLabel',
    defaultMessage: 'Confirmation question',
    description:
      'Label of the field holding the question a participant is asked before the interview ends.',
  },
  finishFailedLabel: {
    id: 'protocolBuilder.finishSession.finishFailedLabel',
    defaultMessage: 'If finishing fails',
    description:
      'Label of the field holding the message a participant sees when the interview could not be ended.',
  },
  outcomeTitle: {
    id: 'protocolBuilder.finishSession.outcomeTitle',
    defaultMessage: 'Outcome',
    description:
      'Heading of the section where a researcher chooses how an interview that ends on this screen is recorded as having ended.',
  },
  outcomeDescription: {
    id: 'protocolBuilder.finishSession.outcomeDescription',
    defaultMessage:
      'Choose how an interview that ends here is recorded. The outcome is saved with the interview and included in data exports. Participants never see it.',
    description: 'Description of the outcome section.',
  },
  outcomeLabel: {
    id: 'protocolBuilder.finishSession.outcomeLabel',
    defaultMessage: 'How the interview ended',
    description:
      'Label of the choice between the ways an interview that ends on this screen can be recorded as having ended.',
  },
  outcomeCompleted: {
    id: 'protocolBuilder.finishSession.outcomeCompleted',
    defaultMessage: 'Completed',
    description:
      'Outcome option: the interview ended normally. Exported as the value "completed".',
  },
  outcomeCompletedDescription: {
    id: 'protocolBuilder.finishSession.outcomeCompletedDescription',
    defaultMessage: 'The participant reached the normal end of the interview.',
    description: 'Explanation under the "Completed" outcome option.',
  },
  outcomeIneligible: {
    id: 'protocolBuilder.finishSession.outcomeIneligible',
    defaultMessage: 'Ineligible',
    description:
      'Outcome option: the interview ended because the participant did not qualify for the study. Exported as the value "ineligible".',
  },
  outcomeIneligibleDescription: {
    id: 'protocolBuilder.finishSession.outcomeIneligibleDescription',
    defaultMessage: 'The participant did not qualify for the study.',
    description: 'Explanation under the "Ineligible" outcome option.',
  },
  outcomeTerminated: {
    id: 'protocolBuilder.finishSession.outcomeTerminated',
    defaultMessage: 'Ended early',
    description:
      'Outcome option: the interview was ended early for a reason the protocol decides, such as a distress or safety stop. Exported as the value "terminated".',
  },
  outcomeTerminatedDescription: {
    id: 'protocolBuilder.finishSession.outcomeTerminatedDescription',
    defaultMessage:
      'The interview ended early for another reason, such as a distress or safety stop.',
    description: 'Explanation under the "Ended early" outcome option.',
  },
});

/**
 * Author-facing names for each outcome. The outcome values are schema
 * contract and are what exports write; these words are editor copy, shared
 * with the host's printable protocol summary.
 */
export const finishOutcomeWords: Readonly<
  Record<
    FinishOutcome,
    Readonly<{ label: MessageDescriptor; description: MessageDescriptor }>
  >
> = Object.freeze({
  completed: {
    label: finishSessionMessages.outcomeCompleted,
    description: finishSessionMessages.outcomeCompletedDescription,
  },
  ineligible: {
    label: finishSessionMessages.outcomeIneligible,
    description: finishSessionMessages.outcomeIneligibleDescription,
  },
  terminated: {
    label: finishSessionMessages.outcomeTerminated,
    description: finishSessionMessages.outcomeTerminatedDescription,
  },
});

/**
 * Author-facing names for each way a participant finishes. The mode values
 * are schema contract; these words are editor copy, shared with the host's
 * printable protocol summary.
 */
export const finishModeWords: Readonly<
  Record<
    FinishMode,
    Readonly<{ label: MessageDescriptor; description: MessageDescriptor }>
  >
> = Object.freeze({
  confirmation: {
    label: finishSessionMessages.modeConfirmation,
    description: finishSessionMessages.modeConfirmationDescription,
  },
  automatic: {
    label: finishSessionMessages.modeAutomatic,
    description: finishSessionMessages.modeAutomaticDescription,
  },
});
