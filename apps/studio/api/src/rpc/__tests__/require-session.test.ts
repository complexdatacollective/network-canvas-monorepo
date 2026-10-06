import { randomBytes } from 'node:crypto';

import { layer } from '@effect/vitest';
import { Cause, Effect, Exit, Layer, Option, Schema } from 'effect';
import { Rpc, RpcClient, RpcGroup, RpcTest } from 'effect/rpc';
import { describe, expect } from 'vitest';

import { AuditActor } from '@codaco/studio-contract/middleware/audit-actor';
import {
  PARTICIPANT_SESSION_HEADER,
  ParticipantSession,
  RequireSession,
} from '@codaco/studio-contract/middleware/session';

import { TestDatabaseLive, testDb } from '../../__tests__/support/database.ts';
import {
  completeSession,
  insertSession,
  seedInterviewFixture,
  tokenFor,
} from '../../interview/__tests__/fixture.ts';
import { RequireSessionLive } from '../require-session.ts';

const Seen = Schema.Struct({
  sessionId: Schema.String,
  studyId: Schema.String,
  teamId: Schema.String,
  holderEpoch: Schema.Number,
  status: Schema.String,
  accessTeamId: Schema.String,
  actorKind: Schema.String,
  actorId: Schema.String,
  actorLabel: Schema.String,
});

const ProbeRpcs = RpcGroup.make(
  Rpc.make('probe.session', { success: Seen }),
).middleware(RequireSession);

const ProbeHandlers = ProbeRpcs.toLayer({
  'probe.session': () =>
    Effect.gen(function* () {
      const session = yield* ParticipantSession;
      const actor = yield* AuditActor;
      return {
        sessionId: session.sessionId,
        studyId: session.studyId,
        teamId: session.teamId,
        holderEpoch: session.holderEpoch,
        status: session.status,
        accessTeamId: session.access.teamId,
        actorKind: actor.kind,
        actorId: actor.id,
        actorLabel: actor.label,
      };
    }),
});

const Harness = Layer.mergeAll(ProbeHandlers, RequireSessionLive).pipe(
  Layer.provideMerge(TestDatabaseLive),
);

const call = (headers: Record<string, string>) =>
  Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(ProbeRpcs, { flatten: true });
    return yield* Effect.exit(
      RpcClient.withHeaders(client('probe.session', undefined), headers),
    );
  }).pipe(Effect.scoped);

const refusedAs = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit)
    ? Option.match(Cause.findErrorOption(exit.cause), {
        onNone: () => 'died',
        onSome: (error) =>
          Schema.is(Schema.Struct({ _tag: Schema.String }))(error)
            ? error._tag
            : 'untagged',
      })
    : 'succeeded';

describe.skipIf(!testDb)('RequireSessionLive', () => {
  layer(Harness, { excludeTestServices: true })('', (it) => {
    it.effect('provides the session and a participant audit actor', () =>
      Effect.gen(function* () {
        const fixture = yield* seedInterviewFixture();
        const sessionId = yield* insertSession(fixture);
        const token = yield* tokenFor(fixture, sessionId);

        const exit = yield* call({ [PARTICIPANT_SESSION_HEADER]: token });
        expect(exit).toEqual(
          Exit.succeed({
            sessionId,
            studyId: fixture.studyId,
            teamId: fixture.teamId,
            holderEpoch: 0,
            status: 'in_progress',
            accessTeamId: fixture.teamId,
            actorKind: 'participant',
            actorId: sessionId,
            actorLabel: fixture.participantCode,
          }),
        );
      }).pipe(Effect.orDie),
    );

    it.effect('labels an anonymous participant by a short session id', () =>
      Effect.gen(function* () {
        const fixture = yield* seedInterviewFixture();
        const sessionId = yield* insertSession(fixture, {
          participantId: null,
        });
        const token = yield* tokenFor(fixture, sessionId);

        const exit = yield* call({ [PARTICIPANT_SESSION_HEADER]: token });
        expect(Exit.isSuccess(exit) && exit.value.actorLabel).toBe(
          sessionId.slice(0, 8),
        );
      }).pipe(Effect.orDie),
    );

    it.effect(
      'resolves a completed session and leaves the refusal to the handler',
      () =>
        Effect.gen(function* () {
          const fixture = yield* seedInterviewFixture();
          const sessionId = yield* insertSession(fixture);
          const token = yield* tokenFor(fixture, sessionId);
          yield* completeSession(sessionId);

          const exit = yield* call({ [PARTICIPANT_SESSION_HEADER]: token });
          expect(Exit.isSuccess(exit) && exit.value.status).toBe('completed');
        }).pipe(Effect.orDie),
    );

    it.effect('refuses a missing, malformed or unknown token', () =>
      Effect.gen(function* () {
        const fixture = yield* seedInterviewFixture();
        const unknown = `${fixture.teamId}.${randomBytes(32).toString('base64url')}`;
        expect(refusedAs(yield* call({}))).toBe('Unauthorized');
        expect(
          refusedAs(
            yield* call({ [PARTICIPANT_SESSION_HEADER]: 'not-a-token-at-all' }),
          ),
        ).toBe('Unauthorized');
        expect(
          refusedAs(yield* call({ [PARTICIPANT_SESSION_HEADER]: unknown })),
        ).toBe('Unauthorized');
      }).pipe(Effect.orDie),
    );

    it.effect('refuses a token presented under another team', () =>
      Effect.gen(function* () {
        const fixture = yield* seedInterviewFixture();
        const other = yield* seedInterviewFixture();
        const sessionId = yield* insertSession(fixture);
        const token = yield* tokenFor(fixture, sessionId);
        const secret = token.slice(token.lastIndexOf('.') + 1);

        expect(
          refusedAs(
            yield* call({
              [PARTICIPANT_SESSION_HEADER]: `${other.teamId}.${secret}`,
            }),
          ),
        ).toBe('Unauthorized');
      }).pipe(Effect.orDie),
    );

    it.effect('never authenticates from a cookie', () =>
      Effect.gen(function* () {
        const fixture = yield* seedInterviewFixture();
        const sessionId = yield* insertSession(fixture);
        const token = yield* tokenFor(fixture, sessionId);

        expect(
          refusedAs(
            yield* call({
              cookie: `${PARTICIPANT_SESSION_HEADER}=${token}; session=${token}`,
            }),
          ),
        ).toBe('Unauthorized');
      }).pipe(Effect.orDie),
    );
  });
});
