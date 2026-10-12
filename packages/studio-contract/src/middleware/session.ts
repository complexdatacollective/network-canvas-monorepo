import { Context } from 'effect';
import { RpcMiddleware } from 'effect/rpc';

import type { TeamAccess } from '@codaco/studio-sync/tenant';

import { Unauthorized } from '../schema/errors.ts';
import type { SessionToken, StudyId, TeamId } from '../schema/ids.ts';
import type { ParticipantSessionStatus } from '../schema/participant.ts';
import type { AuditActor } from './auditActor.ts';

/**
 * A dedicated header, never `Authorization` and never a cookie: a credential
 * the browser attaches by itself would let a signed-in researcher answer for
 * the participant.
 */
export const PARTICIPANT_SESSION_HEADER = 'x-studio-participant-session';

export class ParticipantSession extends Context.Service<
  ParticipantSession,
  {
    readonly sessionId: string;
    readonly sessionToken: SessionToken;
    readonly studyId: StudyId;
    readonly teamId: TeamId;
    readonly holderEpoch: number;
    readonly status: ParticipantSessionStatus;
    readonly access: TeamAccess;
  }
>()('@studio/ParticipantSession') {}

export class RequireSession extends RpcMiddleware.Service<
  RequireSession,
  { provides: ParticipantSession | AuditActor }
>()('@studio/RequireSession', {
  error: Unauthorized,
  requiredForClient: false,
}) {}
