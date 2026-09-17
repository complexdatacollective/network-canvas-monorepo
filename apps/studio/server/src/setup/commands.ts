import { and, eq, isNull, sql } from 'drizzle-orm';
import { Effect, Option, Schema } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import type { AuthService } from '../auth/service.ts';
import type { Database } from '../db/client.ts';
import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction, UntenantedScope } from '../db/tenant.ts';
import { SetCookies } from '../rpc/set-cookies.ts';
import { bootstrapTokenMatches, readInstallation } from './bootstrap.ts';
import { SETUP_TABLES } from './schema.ts';

// First-run setup, the command behind the public `setup.complete` procedure
// (#1909): spend the bootstrap token, create the first owner, name the
// instance, and sign the browser in.

const { installation } = SETUP_TABLES;

export type CompleteSetupInput = {
  token: string;
  instanceName: string;
  owner: { name: string; email: string; password: string };
};

export type CompletedSetup = {
  instanceName: string;
  /**
   * Whether the browser was actually signed in. A call that arrived over the
   * WebSocket, or in process, has no HTTP response to carry a cookie on — so
   * nothing is set and this says so, which is what decides whether the shell
   * continues into the signed-in app or sends the new owner to sign in.
   */
  signedIn: boolean;
};

const SetupFailure = Schema.Literals([
  /** Already owned, or no installation to set up: `/setup` is not here. */
  'closed',
  /** Wrong token, or none outstanding. Never distinguished from each other. */
  'unauthorized',
  /** The address has an account whose password the caller did not give. */
  'emailTaken',
]);

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
 * Claims the instance for the account that was just established.
 *
 * A conditional update that re-checks BOTH the absence of an owner and the
 * token it was authorised by, so two concurrent calls cannot both succeed and
 * a token rotated in between loses. `.returning()` is what makes that real:
 * without it the builder answers with the driver's own result object, typed as
 * a row array and not one, so a losing claim would read as a winning one and
 * two callers would each be told they own the instance.
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
  // A null hash can never be claimed against: `eq(…, null)` is SQL's unknown,
  // which matches nothing — and an installation with no token outstanding is
  // exactly one nobody may claim.
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
 * the auth provider's own API, on its own connection, and the ownership mark
 * is an update this application makes. They are ordered so that the window
 * between them is recoverable rather than fatal — which is why the two
 * `UntenantedScope` transactions here are deliberately separate rather than
 * one around the whole command.
 *
 * **If the process dies between the two**, the account exists and the
 * installation is still ownerless with the same token outstanding. Running
 * `/setup` again with the same token, email and password then signs that
 * account in instead of creating it, and marks it owner — which is why
 * `signInEmail` is on the seam at all. Possession of the password is what
 * makes adopting an existing account safe: it is proof the account is the
 * caller's, whether this flow created it a moment ago or the operator signed
 * up before setting the instance up. An address whose password the caller
 * cannot produce is refused outright.
 *
 * Untenanted because there is no tenant: `installation` is a singleton row
 * with no team, and this runs before any team exists at all.
 */
export const completeSetup: (
  auth: AuthService,
  input: CompleteSetupInput,
) => Effect.Effect<
  CompletedSetup,
  SetupCommandError | SqlError.SqlError,
  Database
> = Effect.fn('setup.complete')(function* (
  auth: AuthService,
  input: CompleteSetupInput,
) {
  const existing = yield* UntenantedScope.open(readInstallation());
  // A missing row is an unprovisioned database, not an open instance: there is
  // no token to spend and nothing to mark. It reads as closed, like an owned
  // one, because neither can be set up from here.
  if (existing === null || existing.ownerUserId !== null) {
    return yield* new SetupCommandError({ reason: 'closed' });
  }
  if (!bootstrapTokenMatches(input.token, existing.bootstrapTokenHash)) {
    return yield* new SetupCommandError({ reason: 'unauthorized' });
  }

  const session = yield* establishOwnerSession(auth, input.owner);

  const owned = yield* UntenantedScope.open(
    claimInstallation({
      ownerUserId: session.userId,
      instanceName: input.instanceName,
      bootstrapTokenHash: existing.bootstrapTokenHash,
    }),
  );
  // Somebody else completed setup, or the token was rotated, while this call
  // was creating the account. The account stays — it is a real account whose
  // owner holds the password — but it is not this instance's owner.
  if (!owned) return yield* new SetupCommandError({ reason: 'closed' });

  // The provider's own `set-cookie` strings, handed to the request's holder;
  // the `/rpc` route middleware folds them onto the response on the way out.
  // A transport with no response to carry them has no holder, and the result
  // says the browser was not signed in.
  const setCookies = yield* Effect.serviceOption(SetCookies);
  const cookies = session.headers.getSetCookie();
  if (Option.isNone(setCookies) || cookies.length === 0) {
    return { instanceName: input.instanceName, signedIn: false };
  }
  for (const cookie of cookies) {
    yield* setCookies.value.append(cookie);
  }
  return { instanceName: input.instanceName, signedIn: true };
});

const establishOwnerSession = Effect.fnUntraced(function* (
  auth: AuthService,
  owner: CompleteSetupInput['owner'],
) {
  const created = yield* Effect.promise(() => auth.signUpEmail(owner));
  if (created.kind === 'created') return created.session;
  // Auth off means no database or no secret, and `setup.required` is false in
  // both — so this is a deployment fault rather than a refusal, and it leaves
  // as one.
  if (created.kind === 'unavailable') {
    return yield* Effect.die(
      new Error('first-run setup reached with auth disabled'),
    );
  }

  const adopted = yield* Effect.promise(() =>
    auth.signInEmail({ email: owner.email, password: owner.password }),
  );
  if (adopted.kind === 'refused') {
    return yield* new SetupCommandError({ reason: 'emailTaken' });
  }
  return adopted.session;
});
