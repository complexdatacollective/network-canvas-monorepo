import { Context } from 'effect';
import { RpcMiddleware } from 'effect/unstable/rpc';

import { Unauthorized } from '../schema/errors.ts';
import type { SessionToken, StudyId, TeamId } from '../schema/ids.ts';

// The participant plane's credential (#1899). Declarations only, like
// `./authenticated.ts`.

/**
 * A participant part-way through an interview. The session token is read from
 * a request header and cookies are ignored entirely: a participant may be
 * running the interview in the same browser a researcher is signed in to, and
 * an ambient cookie would let one identity answer for the other.
 *
 * `holderEpoch` rises each time the session is handed to a new holder, so a
 * request carrying an older epoch is a resumed tab that has since been
 * superseded rather than the current one.
 */
export class ParticipantSession extends Context.Service<
  ParticipantSession,
  {
    readonly sessionId: string;
    readonly sessionToken: SessionToken;
    readonly studyId: StudyId;
    readonly teamId: TeamId;
    readonly holderEpoch: number;
  }
>()('@studio/ParticipantSession') {}

/**
 * Two middlewares rather than one with a mode parameter. A participant
 * procedure declaring `RequireSession` cannot compile against `Principal`, and
 * a researcher procedure cannot compile against `ParticipantSession` — so the
 * plane a procedure belongs to is settled by the type checker rather than by a
 * runtime branch that could be got wrong.
 */
export class RequireSession extends RpcMiddleware.Service<
  RequireSession,
  { provides: ParticipantSession }
>()('@studio/RequireSession', {
  error: Unauthorized,
  requiredForClient: false,
}) {}
