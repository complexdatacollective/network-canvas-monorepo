import type { ErrorComponentProps } from '@tanstack/react-router';

import ErrorScreen from '../routes/ErrorScreen.tsx';
import ParticipantNotice, {
  noticeFor,
  type NoticeScope,
} from './ParticipantNotice.tsx';

const participantErrorScreen = (scope: NoticeScope) =>
  function ParticipantErrorScreen(props: ErrorComponentProps) {
    const kind = noticeFor(props.error, scope);
    return kind === undefined ? (
      <ErrorScreen {...props} />
    ) : (
      <ParticipantNotice kind={kind} />
    );
  };

export const LinkErrorScreen = participantErrorScreen('link');

export const SessionErrorScreen = participantErrorScreen('session');
