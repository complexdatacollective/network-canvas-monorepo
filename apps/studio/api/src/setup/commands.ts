import { and, eq, isNull, sql } from 'drizzle-orm';
import { Effect, Option, type Redacted, Schema } from 'effect';
import type { SqlError } from 'effect/sql';

import { AuditActor } from '@codaco/studio-contract/middleware/audit-actor';
import type { NotFound } from '@codaco/studio-contract/schema/errors';

import type { AuditSignal } from '../audit/signal.ts';
import { AuthService } from '../auth/service.ts';
import type { Database } from '../db/client.ts';
import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction, UntenantedScope } from '../db/tenant.ts';
import type { RequestId } from '../http/middleware/request-id.ts';
import type { Jobs } from '../jobs/jobs.ts';
import type { Analytics } from '../platform/analytics.ts';
import { SetCookies } from '../rpc/set-cookies.ts';
import { createOwnedTeam, ownerLabel } from '../team/commands.ts';
import { bootstrapTokenMatches, readInstallation } from './bootstrap.ts';
import { SETUP_TABLES } from './schema.ts';

const { installation } = SETUP_TABLES;

export type CompleteSetupInput = {
  token: Redacted.Redacted;
  instanceName: string;
  owner: {
    name: Redacted.Redacted;
    email: Redacted.Redacted;
    password: Redacted.Redacted;
  };
};

export type CompletedSetup = {
  instanceName: string;
  signedIn: boolean;
};

const SetupFailure = Schema.Literals(['closed', 'unauthorized', 'emailTaken']);

type SetupFailure = typeof SetupFailure.Type;

export class SetupCommandError extends Schema.TaggedError<SetupCommandError>()(
  'SetupCommandError',
  { reason: SetupFailure },
) {
  override get message(): string {
    return `first-run setup refused: ${this.reason}`;
  }
}

/**
 * Re-checks both the absence of an owner and the token it was authorised by,
 * so two concurrent calls cannot both succeed.
 */
const claimInstallation: (input: {
  ownerUserId: string;
  instanceName: string;
  bootstrapTokenHash: string | null;
}) => Effect.Effect<boolean, SqlError.SqlError, Transaction> = Effect.fn(
  'setup.claimInstallation',
)(function* (input: {
  ownerUserId: string;
  instanceName: string;
  bootstrapTokenHash: string | null;
}) {
  const { tx } = yield* Transaction;
  // `eq(…, null)` is SQL's unknown, which matches nothing.
  if (input.bootstrapTokenHash === null) return false;
  const owned = yield* tx
    .update(installation)
    .set({
      ownerUserId: input.ownerUserId,
      name: input.instanceName,
      bootstrapTokenHash: null,
      bootstrapTokenIssuedAt: null,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(installation.id, 1),
        isNull(installation.ownerUserId),
        eq(installation.bootstrapTokenHash, input.bootstrapTokenHash),
      ),
    )
    .returning({ id: installation.id });
  return owned.length === 1;
}, sqlErrorsOnly);

/**
 * Two writes that cannot share a transaction: the account is created through
 * the auth provider's own API, on its own connection. If the process dies
 * between the two, running `/setup` again with the same password signs that
 * account in and marks it owner.
 */
export const completeSetup: (
  input: CompleteSetupInput,
) => Effect.Effect<
  CompletedSetup,
  SetupCommandError | NotFound | SqlError.SqlError,
  Database | AuthService | RequestId | AuditSignal | Analytics | Jobs
> = Effect.fn('setup.complete')(function* (input: CompleteSetupInput) {
  const existing = yield* UntenantedScope.open(readInstallation());
  if (existing === null || existing.ownerUserId !== null) {
    return yield* new SetupCommandError({ reason: 'closed' });
  }
  if (!bootstrapTokenMatches(input.token, existing.bootstrapTokenHash)) {
    return yield* new SetupCommandError({ reason: 'unauthorized' });
  }

  const session = yield* establishOwnerSession(input.owner);

  const label = ownerLabel(input.owner.name, input.owner.email);
  yield* createOwnedTeam({
    name: input.instanceName.trim(),
    ownerUserId: session.userId,
    ownerLabel: label,
    before: Effect.gen(function* () {
      const owned = yield* claimInstallation({
        ownerUserId: session.userId,
        instanceName: input.instanceName,
        bootstrapTokenHash: existing.bootstrapTokenHash,
      });
      if (!owned) return yield* new SetupCommandError({ reason: 'closed' });
    }),
  }).pipe(
    Effect.provideService(
      AuditActor,
      AuditActor.of({ kind: 'user', id: session.userId, label }),
    ),
  );

  const setCookies = yield* Effect.serviceOption(SetCookies);
  if (Option.isNone(setCookies) || session.setCookies.length === 0) {
    return { instanceName: input.instanceName, signedIn: false };
  }
  for (const cookie of session.setCookies) {
    yield* setCookies.value.append(cookie);
  }
  return { instanceName: input.instanceName, signedIn: true };
});

const establishOwnerSession = Effect.fnUntraced(function* (
  owner: CompleteSetupInput['owner'],
) {
  const auth = yield* AuthService;
  const created = yield* auth.signUpEmail(owner);
  if (created.kind === 'created') return created.session;
  if (created.kind === 'unavailable') {
    return yield* Effect.die(
      new Error('first-run setup reached with auth disabled'),
    );
  }

  const adopted = yield* auth.signInEmail({
    email: owner.email,
    password: owner.password,
  });
  if (adopted.kind === 'refused') {
    return yield* new SetupCommandError({ reason: 'emailTaken' });
  }
  return adopted.session;
});
