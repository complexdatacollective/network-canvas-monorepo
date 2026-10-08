import {
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import type { FinishOutcome } from '@codaco/protocol-validation';

/**
 * Everything the finish stage editor says.
 *
 * A finish stage is the screen that ends the interview: the participant reads
 * its heading and text, and finishes the interview from it. Its outcome
 * records how an interview that ended there ended; the participant never sees
 * it.
 */
export const finishSessionMessages = defineMessages({
  closingTitle: {
    id: 'protocolBuilder.finishSession.closingTitle',
    defaultMessage: 'Closing screen',
    description:
      'Heading of the section where a researcher writes what a participant reads on the screen that ends the interview.',
  },
  closingDescription: {
    id: 'protocolBuilder.finishSession.closingDescription',
    defaultMessage:
      'Write what participants read at the end of the interview. They finish the interview from this screen, and see this text again whenever the finished interview is opened.',
    description: 'Description of the closing-screen section.',
  },
  headingLabel: {
    id: 'protocolBuilder.finishSession.headingLabel',
    defaultMessage: 'Heading',
    description:
      'Label of the field holding the heading at the top of the screen that ends the interview.',
  },
  textLabel: {
    id: 'protocolBuilder.finishSession.textLabel',
    defaultMessage: 'Text',
    description:
      'Label of the field holding the text a participant reads on the screen that ends the interview.',
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
