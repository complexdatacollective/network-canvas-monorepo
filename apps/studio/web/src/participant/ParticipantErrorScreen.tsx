import { type ErrorComponentProps, useParams } from '@tanstack/react-router';
import { useEffect } from 'react';

import ErrorScreen from '../routes/ErrorScreen.tsx';
import { faultCodeOf } from '../runtime/errors.ts';
import {
  logSessionLoadFailed,
  useStatusParticipantLogs,
} from './participantLogs.ts';
import ParticipantNotice, {
  noticeFor,
  type NoticeScope,
} from './ParticipantNotice.tsx';

function SessionLoadFailure({
  sessionToken,
  error,
}: {
  readonly sessionToken: string;
  readonly error: unknown;
}): null {
  useStatusParticipantLogs(sessionToken);
  useEffect(() => logSessionLoadFailed(faultCodeOf(error)), [error]);
  return null;
}

const participantErrorScreen = (scope: NoticeScope) =>
  function ParticipantErrorScreen(props: ErrorComponentProps) {
    const { sessionToken } = useParams({ strict: false });
    const kind = noticeFor(props.error, scope);
    return (
      <>
        {scope === 'session' && sessionToken !== undefined && (
          <SessionLoadFailure sessionToken={sessionToken} error={props.error} />
        )}
        {kind === undefined ? (
          <ErrorScreen {...props} participant />
        ) : (
          <ParticipantNotice kind={kind} />
        )}
      </>
    );
  };

export const LinkErrorScreen = participantErrorScreen('link');

export const SessionErrorScreen = participantErrorScreen('session');
