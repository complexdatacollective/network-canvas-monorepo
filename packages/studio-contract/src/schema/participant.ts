import { Schema } from 'effect';

import { LinkToken, SessionToken, StudyId } from './ids.ts';
import { DecimalSequence, NonNegativeInt } from './primitives.ts';
import { problemFields } from './problem.ts';

// The participant plane: how someone holding a participation link gets a
// session, keeps it in step with the server, and finishes it.
//
// Declarations only. Nothing serves these in this stage — #1899 lands after
// the migration and implements against exactly this shape, which is why it is
// written now rather than left for that issue to invent.
//
// What is settled and what is not: `PARTICIPANT_SESSION_HEADER`,
// `RedeemInput`, `RedeemResult` and the three error classes are fixed by S1
// (§3.5, §6.2) and #1899's own design, so a change to them is a change to a
// decision already taken. The field lists of `ParticipantSessionState`,
// `SessionPayload`, `SyncInput`/`SyncResult` and `FinishInput`/`FinishResult`
// are placeholders: they carry the concurrency control the sync loop needs
// (`holderEpoch`, `revision`) and the interview state it moves, but #1899
// finalises what an interview payload actually contains.
//
// Input type == output type for every boundary schema here: no transforms, no
// coercions, no defaults.

/**
 * Where a participant presents their session token (#1899 §22).
 *
 * A dedicated header, never `Authorization` and never a cookie: a participant
 * may be running the interview in a browser a researcher is signed in to, and
 * a credential the browser attaches by itself would let one identity answer
 * for the other.
 */
export const PARTICIPANT_SESSION_HEADER = 'x-studio-participant-session';

export const ParticipantSessionState = Schema.Literals([
  'active',
  'completed',
  'abandoned',
  'expired',
]);

/**
 * Spending a participation link. `occurrence` names which repeat of a
 * recurring wave is being answered; a study with a single occurrence omits it.
 */
export const RedeemInput = Schema.Struct({
  linkToken: LinkToken,
  occurrence: Schema.optionalKey(Schema.String),
});

export const RedeemResult = Schema.Struct({
  sessionToken: SessionToken,
  sessionId: Schema.String,
});

/**
 * The session as the server currently holds it.
 *
 * `holderEpoch` rises each time the session is handed to a new holder, so a
 * client that reads an epoch above its own has been superseded by another tab
 * or device. `revision` is the server's sequence for the interview state; a
 * write naming an older one is stale.
 */
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

/**
 * A write from the participant's client. It restates the epoch and revision it
 * believes it holds, so the server can refuse a superseded holder or a stale
 * write rather than merging one.
 */
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

/**
 * The session is over and will not accept another write. `state` says how it
 * ended, because a participant who completed the interview and one whose
 * session expired mid-way are shown different screens.
 */
export class SessionEnded extends Schema.TaggedError<SessionEnded>()(
  'SessionEnded',
  {
    ...problemFields('Session ended', 410),
    state: Schema.Literals(['completed', 'abandoned', 'expired']),
  },
  { httpApiStatus: 410 },
) {}

/**
 * Another holder has the session. The current epoch is carried so the refused
 * client can tell how far behind it is, and so a resumed tab can stop writing
 * instead of retrying into the same refusal.
 */
export class SessionTakenOver extends Schema.TaggedError<SessionTakenOver>()(
  'SessionTakenOver',
  {
    ...problemFields('Session taken over', 409),
    holderEpoch: NonNegativeInt,
  },
  { httpApiStatus: 409 },
) {}

/**
 * The link cannot be spent. `state` distinguishes the link's own exhaustion
 * from the study's, which is what decides whether the participant is told to
 * ask for a new link or that the study is no longer running.
 */
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
