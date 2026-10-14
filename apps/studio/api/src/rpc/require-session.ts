import { Effect, Layer, Option, Schema } from 'effect';
import { Headers } from 'effect/http';

import { AuditActor } from '@codaco/studio-contract/middleware/audit-actor';
import {
  PARTICIPANT_SESSION_HEADER,
  ParticipantSession,
  RequireSession,
} from '@codaco/studio-contract/middleware/session';
import { Unauthorized } from '@codaco/studio-contract/schema/errors';
import {
  SessionToken,
  StudyId,
  TeamId,
} from '@codaco/studio-contract/schema/ids';

import { Database } from '../db/client.ts';
import { TenantScope } from '../db/tenant.ts';
import { presentedTokenTeamAccess } from '../interview/access.ts';
import { participantAuditActor } from '../interview/actor.ts';
import { findSessionByTokenHash } from '../interview/store.ts';
import { parsePresentedToken } from '../interview/token.ts';
import { transportHeaders } from './request-headers.ts';

const decodeSessionToken = Schema.decodeUnknownOption(SessionToken);
const decodeStudyId = Schema.decodeUnknownSync(StudyId);
const decodeTeamId = Schema.decodeUnknownSync(TeamId);

export type PresentedParticipant = {
  readonly session: ParticipantSession['Service'];
  readonly actor: AuditActor['Service'];
};

export const presentedParticipant = Effect.fnUntraced(function* (
  headers: Headers.Headers,
): Effect.fn.Return<Option.Option<PresentedParticipant>, never, Database> {
  const sessionToken = Option.flatMap(
    Headers.get(headers, PARTICIPANT_SESSION_HEADER),
    decodeSessionToken,
  );
  const presented = Option.flatMap(sessionToken, parsePresentedToken);
  if (Option.isNone(sessionToken) || Option.isNone(presented)) {
    return Option.none();
  }

  const access = presentedTokenTeamAccess(presented.value.teamId);
  const session = yield* TenantScope.open(
    access,
    findSessionByTokenHash(presented.value.secretHash),
  ).pipe(Effect.orDie);
  if (session === null) return Option.none();

  return Option.some({
    session: ParticipantSession.of({
      sessionId: session.sessionId,
      sessionToken: sessionToken.value,
      studyId: decodeStudyId(session.studyId),
      teamId: decodeTeamId(presented.value.teamId),
      holderEpoch: session.holderEpoch,
      status: session.status,
      access,
    }),
    actor: participantAuditActor(session.sessionId, session.participantCode),
  });
});

export const RequireSessionLive: Layer.Layer<RequireSession, never, Database> =
  Layer.effect(RequireSession)(
    Effect.gen(function* () {
      const database = yield* Database;
      return (effect, options) =>
        Effect.gen(function* () {
          const transport = yield* transportHeaders(options.headers);
          const participant = yield* presentedParticipant(transport).pipe(
            Effect.provideService(Database, database),
          );
          if (Option.isNone(participant)) {
            return yield* new Unauthorized({});
          }
          return yield* effect.pipe(
            Effect.provideService(
              ParticipantSession,
              participant.value.session,
            ),
            Effect.provideService(AuditActor, participant.value.actor),
          );
        });
    }),
  );
