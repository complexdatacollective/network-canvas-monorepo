import { assert, describe, it } from '@effect/vitest';
import { Cause, Effect, Exit, Layer, Redacted, Schema } from 'effect';

import { AuditActor } from '@codaco/studio-contract/middleware/audit-actor';
import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { UserId } from '@codaco/studio-contract/schema/ids';

import { userAuditActor } from '../../audit/actor.ts';
import { DeniedAttempts } from '../../audit/denial-rate-limit.ts';
import { AuditSignal } from '../../audit/signal.ts';
import { DatabaseAbsent } from '../../db/client.ts';
import { unsafeMakeTeamAccess } from '../../db/tenant.ts';
import { RequestId } from '../../http/middleware/request-id.ts';
import { RateLimitStore } from '../../rate-limit/store.ts';
import { SecretsCipher } from '../../secrets/services.ts';
import { createAuditedStudy } from '../commands.ts';

const OWNER = Principal.of({
  kind: 'user',
  userId: Schema.decodeSync(UserId)('user-study-name'),
  email: Redacted.make('owner@example.org'),
  emailVerified: true,
  name: Redacted.make('Owner'),
  locale: null,
  sessionId: 'session-study-name',
});

const Unreachable = Layer.mergeAll(
  DatabaseAbsent,
  SecretsCipher.layerAbsent,
  AuditSignal.layer,
  DeniedAttempts.layer.pipe(Layer.provide(RateLimitStore.layerAbsent)),
  Layer.succeed(RequestId)('request-study-name'),
  Layer.succeed(Principal)(OWNER),
  Layer.succeed(AuditActor)(userAuditActor(OWNER)),
);

describe('createAuditedStudy', () => {
  it.effect.each(['   ', 'a'.repeat(321)])(
    'refuses the study name %# itself, before it reaches anything',
    (name) =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(
          createAuditedStudy(unsafeMakeTeamAccess('team-study-name', 'owner'), {
            name: Redacted.make(name),
            studyId: 'study-name',
            protocolId: 'protocol-study-name',
            draftId: 'draft-study-name',
          }),
        );
        const cause = Exit.isFailure(exit) ? exit.cause : Cause.empty;
        assert.isTrue(Cause.hasDies(cause));
        assert.isTrue(Schema.isSchemaError(Cause.squash(cause)));
      }).pipe(Effect.provide(Unreachable)),
  );
});
