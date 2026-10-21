import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import {
  LinkUnavailable,
  SessionEnded,
  SessionTakenOver,
} from '@codaco/studio-contract/schema/participant';

import { refusalOf } from '../runtime/errors.ts';
import StatusScreen from '../shell/StatusScreen.tsx';

export type ParticipantNoticeKind =
  | 'invalid'
  | 'expired'
  | 'revoked'
  | 'notOpen'
  | 'paused'
  | 'closed'
  | 'finished'
  | 'ended'
  | 'takenOver'
  | 'rateLimited';

const messages = defineMessages({
  invalidHeading: {
    id: 'studio.participant.invalidHeading',
    defaultMessage: "This link doesn't work",
    description:
      'Heading a participant sees when the interview link they opened is not recognised.',
  },
  invalidMessage: {
    id: 'studio.participant.invalidMessage',
    defaultMessage:
      'Check that you opened the whole link, or contact the research team who sent it to you.',
    description:
      'Explanation under the heading for an interview link that is not recognised.',
  },
  expiredHeading: {
    id: 'studio.participant.expiredHeading',
    defaultMessage: 'This link has expired',
    description:
      'Heading a participant sees when their interview link has passed its expiry date.',
  },
  expiredMessage: {
    id: 'studio.participant.expiredMessage',
    defaultMessage:
      'Contact the research team who sent it to you for a new one.',
    description: 'Explanation under the heading for an expired interview link.',
  },
  revokedHeading: {
    id: 'studio.participant.revokedHeading',
    defaultMessage: 'This link is no longer active',
    description:
      'Heading a participant sees when the research team has withdrawn their interview link.',
  },
  revokedMessage: {
    id: 'studio.participant.revokedMessage',
    defaultMessage: 'Contact the research team who sent it to you.',
    description:
      'Explanation under the heading for an interview link that has been withdrawn.',
  },
  notOpenHeading: {
    id: 'studio.participant.notOpenHeading',
    defaultMessage: "This study isn't open yet",
    description:
      'Heading a participant sees when the study their link belongs to has not started taking responses.',
  },
  notOpenMessage: {
    id: 'studio.participant.notOpenMessage',
    defaultMessage: 'Please try again later.',
    description:
      'Explanation under the heading for a study that is not open yet.',
  },
  pausedHeading: {
    id: 'studio.participant.pausedHeading',
    defaultMessage: 'This study is paused',
    description:
      'Heading a participant sees when the research team has paused the study.',
  },
  pausedMessage: {
    id: 'studio.participant.pausedMessage',
    defaultMessage:
      'Your answers up to a moment ago are saved. Please try again later.',
    description:
      'Explanation under the heading for a paused study, reassuring the participant their answers are kept.',
  },
  closedHeading: {
    id: 'studio.participant.closedHeading',
    defaultMessage: 'This study has closed',
    description:
      'Heading a participant sees when the study is no longer taking responses.',
  },
  closedMessage: {
    id: 'studio.participant.closedMessage',
    defaultMessage:
      "It's no longer accepting responses. Thank you for your interest.",
    description: 'Explanation under the heading for a closed study.',
  },
  finishedHeading: {
    id: 'studio.participant.finishedHeading',
    defaultMessage: "You've finished this interview",
    description:
      'Heading a participant sees in place of an interview that was already finished, such as when they open its link again. Finishing in the interview itself shows the closing screen of the interview instead.',
  },
  finishedMessage: {
    id: 'studio.participant.finishedMessage',
    defaultMessage:
      'Thank you for taking part. Your answers have been saved, and you can close this page.',
    description: 'Explanation under the heading for a finished interview.',
  },
  endedHeading: {
    id: 'studio.participant.endedHeading',
    defaultMessage: 'This interview has ended',
    description:
      'Heading a participant sees when their interview ended without being finished.',
  },
  endedMessage: {
    id: 'studio.participant.endedMessage',
    defaultMessage:
      'Open the link you were sent to continue, or contact the research team.',
    description:
      'Explanation under the heading for an interview that ended without being finished.',
  },
  takenOverHeading: {
    id: 'studio.participant.takenOverHeading',
    defaultMessage: 'This interview is open somewhere else',
    description:
      'Heading a participant sees when their interview has been opened in another window or on another device.',
  },
  takenOverMessage: {
    id: 'studio.participant.takenOverMessage',
    defaultMessage:
      'It was opened in another window or on another device. Continue there, or reload to continue here.',
    description:
      'Explanation under the heading for an interview opened somewhere else.',
  },
  rateLimitedHeading: {
    id: 'studio.participant.rateLimitedHeading',
    defaultMessage: 'Too many attempts',
    description:
      'Heading a participant sees when they have opened their link too many times in a short period.',
  },
  rateLimitedMessage: {
    id: 'studio.participant.rateLimitedMessage',
    defaultMessage: 'Please wait a moment and try again.',
    description: 'Explanation under the heading for too many attempts.',
  },
  tryAgain: {
    id: 'studio.participant.tryAgain',
    defaultMessage: 'Try again',
    description:
      'Button on a participant notice that reloads the page to try again.',
  },
  continueHere: {
    id: 'studio.participant.continueHere',
    defaultMessage: 'Continue here',
    description:
      'Button that moves an interview opened elsewhere back to this window.',
  },
});

const COPY: Record<
  ParticipantNoticeKind,
  {
    readonly heading: MessageDescriptor;
    readonly message: MessageDescriptor;
    readonly action?: MessageDescriptor;
  }
> = {
  invalid: {
    heading: messages.invalidHeading,
    message: messages.invalidMessage,
  },
  expired: {
    heading: messages.expiredHeading,
    message: messages.expiredMessage,
  },
  revoked: {
    heading: messages.revokedHeading,
    message: messages.revokedMessage,
  },
  notOpen: {
    heading: messages.notOpenHeading,
    message: messages.notOpenMessage,
  },
  paused: {
    heading: messages.pausedHeading,
    message: messages.pausedMessage,
    action: messages.tryAgain,
  },
  closed: { heading: messages.closedHeading, message: messages.closedMessage },
  finished: {
    heading: messages.finishedHeading,
    message: messages.finishedMessage,
  },
  ended: { heading: messages.endedHeading, message: messages.endedMessage },
  takenOver: {
    heading: messages.takenOverHeading,
    message: messages.takenOverMessage,
    action: messages.continueHere,
  },
  rateLimited: {
    heading: messages.rateLimitedHeading,
    message: messages.rateLimitedMessage,
    action: messages.tryAgain,
  },
};

const LINK_STATES: Record<LinkUnavailable['state'], ParticipantNoticeKind> = {
  not_open: 'notOpen',
  expired: 'expired',
  revoked: 'revoked',
  paused: 'paused',
  closed: 'closed',
  finished: 'finished',
};

export type NoticeScope = 'link' | 'session';

export const noticeFor = (
  error: unknown,
  scope: NoticeScope,
): ParticipantNoticeKind | undefined => {
  if (error instanceof LinkUnavailable) return LINK_STATES[error.state];
  if (error instanceof SessionEnded) {
    return error.state === 'completed' ? 'finished' : 'ended';
  }
  if (error instanceof SessionTakenOver) return 'takenOver';
  switch (refusalOf(error)?.kind) {
    case 'unauthorized':
      return scope === 'link' ? 'invalid' : 'ended';
    case 'rateLimited':
      return 'rateLimited';
    default:
      return undefined;
  }
};

export default function ParticipantNotice({
  kind,
}: {
  kind: ParticipantNoticeKind;
}) {
  const intl = useAppIntl();
  const copy = COPY[kind];
  return (
    <StatusScreen
      focusOnMount
      heading={intl.formatMessage(copy.heading)}
      message={intl.formatMessage(copy.message)}
      action={
        copy.action === undefined
          ? undefined
          : {
              label: intl.formatMessage(copy.action),
              onPress: () => window.location.reload(),
            }
      }
    />
  );
}
