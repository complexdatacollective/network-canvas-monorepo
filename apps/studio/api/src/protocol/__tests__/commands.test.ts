import { randomUUID } from 'node:crypto';

import { assert } from '@effect/vitest';
import { Cause, Effect, Exit, Layer, Redacted, Schema } from 'effect';
import { describe, it } from 'vitest';

import { AuditActor } from '@codaco/studio-contract/middleware/audit-actor';
import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { UserId } from '@codaco/studio-contract/schema/ids';

import { testCipher } from '../../__tests__/support/secrets.ts';
import { userAuditActor } from '../../audit/actor.ts';
import { AuditSignal } from '../../audit/signal.ts';
import { DatabaseAbsent } from '../../db/client.ts';
import { unsafeMakeTeamAccess } from '../../db/tenant.ts';
import { RequestId } from '../../http/middleware/request-id.ts';
import { Jobs } from '../../jobs/jobs.ts';
import { Analytics } from '../../platform/analytics.ts';
import { SecretsCipher } from '../../secrets/services.ts';
import { createAuditedProtocol } from '../commands.ts';

const PRINCIPAL = Principal.of({
  kind: 'user',
  userId: Schema.decodeSync(UserId)('protocol-command-owner'),
  email: Redacted.make('protocol-command-owner@example.com'),
  emailVerified: true,
  name: Redacted.make('Protocol Command Owner'),
  locale: null,
  sessionId: 'protocol-command-owner-session',
});

const Harness = Layer.mergeAll(
  DatabaseAbsent,
  AuditSignal.layer,
  Analytics.layerDisabled,
  Jobs.layerRecording,
  Layer.succeed(SecretsCipher)(testCipher()),
  Layer.succeed(Principal, PRINCIPAL),
  Layer.succeed(AuditActor, userAuditActor(PRINCIPAL)),
  Layer.succeed(RequestId, RequestId.of(randomUUID())),
);

describe('audited protocol commands', () => {
  it('rejects a whitespace-only protocol name before opening a transaction', async () => {
    const outcome = await Effect.runPromise(
      Effect.exit(
        createAuditedProtocol(
          unsafeMakeTeamAccess('protocol-command-team', 'owner'),
          {
            name: Redacted.make('   '),
            protocolId: randomUUID(),
            draftId: randomUUID(),
          },
        ).pipe(Effect.provide(Harness)),
      ),
    );

    assert.isTrue(Exit.isFailure(outcome));
    assert.include(
      Exit.isFailure(outcome) ? Cause.pretty(outcome.cause) : '',
      'Protocol name must contain a non-whitespace character',
    );
  });
});
