import { randomUUID } from 'node:crypto';

import { assert } from '@effect/vitest';
import { Cause, Effect, Exit, Layer, Schema } from 'effect';
import { describe, it } from 'vitest';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { UserId } from '@codaco/studio-contract/schema/ids';

import { testCipher } from '../../__tests__/support/secrets.ts';
import { AuditSignal } from '../../audit/signal.ts';
import { DatabaseAbsent } from '../../db/client.ts';
import { unsafeMakeTeamAccess } from '../../db/tenant.ts';
import { RequestId } from '../../http/middleware/request-id.ts';
import { SecretsCipher } from '../../secrets/services.ts';
import { createAuditedProtocol } from '../commands.ts';

const PRINCIPAL = Principal.of({
  kind: 'user',
  userId: Schema.decodeSync(UserId)('protocol-command-owner'),
  email: 'protocol-command-owner@example.com',
  emailVerified: true,
  name: 'Protocol Command Owner',
  locale: null,
  sessionId: 'protocol-command-owner-session',
});

/**
 * Everything the command needs EXCEPT a usable database. `DatabaseAbsent`
 * throws on first touch, which is what makes "before opening a transaction" an
 * oracle rather than a claim: a command that reached the scope would fail with
 * that error instead of the name refusal.
 */
const Harness = Layer.mergeAll(
  DatabaseAbsent,
  AuditSignal.layer,
  Layer.succeed(SecretsCipher)(testCipher()),
  Layer.succeed(Principal, PRINCIPAL),
  Layer.succeed(RequestId, RequestId.of(randomUUID())),
);

describe('audited protocol commands', () => {
  it('rejects a whitespace-only protocol name before opening a transaction', async () => {
    const outcome = await Effect.runPromise(
      Effect.exit(
        createAuditedProtocol(
          unsafeMakeTeamAccess('protocol-command-team', 'owner'),
          {
            name: '   ',
            protocolId: randomUUID(),
            draftId: randomUUID(),
          },
        ).pipe(Effect.provide(Harness)),
      ),
    );

    assert.isTrue(Exit.isFailure(outcome));
    // A contract violation rather than a refusal a caller could act on, so it
    // is a defect — and the message is the schema's, not the database's.
    assert.include(
      Exit.isFailure(outcome) ? Cause.pretty(outcome.cause) : '',
      'Protocol name must contain a non-whitespace character',
    );
  });
});
