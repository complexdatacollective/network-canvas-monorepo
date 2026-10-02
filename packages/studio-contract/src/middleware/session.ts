import { Context } from 'effect';
import { RpcMiddleware } from 'effect/rpc';

import { Unauthorized } from '../schema/errors.ts';
import type { SessionToken, StudyId, TeamId } from '../schema/ids.ts';

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

export class RequireSession extends RpcMiddleware.Service<
  RequireSession,
  { provides: ParticipantSession }
>()('@studio/RequireSession', {
  error: Unauthorized,
  requiredForClient: false,
}) {}
