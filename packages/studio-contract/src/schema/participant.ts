import { Schema } from 'effect';

import { LinkToken, SessionToken, StudyId } from './ids.ts';
import { DecimalSequence, NonNegativeInt } from './primitives.ts';
import { problemFields } from './problem.ts';

/**
 * A dedicated header, never `Authorization` and never a cookie: a credential
 * the browser attaches by itself would let a signed-in researcher answer for
 * the participant.
 */
export const PARTICIPANT_SESSION_HEADER = 'x-studio-participant-session';

export const ParticipantSessionState = Schema.Literals([
  'active',
  'completed',
  'abandoned',
  'expired',
]);

export const RedeemInput = Schema.Struct({
  linkToken: LinkToken,
  occurrence: Schema.optionalKey(Schema.String),
});

export const RedeemResult = Schema.Struct({
  sessionToken: SessionToken,
  sessionId: Schema.String,
});

export const SessionPayload = Schema.Struct({
  sessionId: Schema.String,
  studyId: StudyId,
  holderEpoch: NonNegativeInt,
  revision: DecimalSequence,
  state: ParticipantSessionState,
  network: Schema.Record(Schema.String, Schema.Unknown),
  stage: Schema.NullOr(Schema.String),
  ego: Schema.Record(Schema.String, Schema.Unknown),
});

export const SyncInput = Schema.Struct({
  holderEpoch: NonNegativeInt,
  revision: DecimalSequence,
  network: Schema.Record(Schema.String, Schema.Unknown),
  stage: Schema.NullOr(Schema.String),
  ego: Schema.Record(Schema.String, Schema.Unknown),
});

export const SyncResult = Schema.Struct({
  revision: DecimalSequence,
});

export const FinishInput = Schema.Struct({
  holderEpoch: NonNegativeInt,
  revision: DecimalSequence,
});

export const FinishResult = Schema.Struct({
  state: Schema.Literal('completed'),
});

export class SessionEnded extends Schema.TaggedError<SessionEnded>()(
  'SessionEnded',
  {
    ...problemFields('Session ended', 410),
    state: Schema.Literals(['completed', 'abandoned', 'expired']),
  },
  { httpApiStatus: 410 },
) {}

export class SessionTakenOver extends Schema.TaggedError<SessionTakenOver>()(
  'SessionTakenOver',
  {
    ...problemFields('Session taken over', 409),
    holderEpoch: NonNegativeInt,
  },
  { httpApiStatus: 409 },
) {}

export class LinkUnavailable extends Schema.TaggedError<LinkUnavailable>()(
  'LinkUnavailable',
  {
    ...problemFields('Link unavailable', 410),
    state: Schema.Literals([
      'expired',
      'revoked',
      'paused',
      'closed',
      'finished',
    ]),
  },
  { httpApiStatus: 410 },
) {}
