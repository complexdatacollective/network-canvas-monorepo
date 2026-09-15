import type pg from 'pg';

import type { AuthService, EstablishedSession } from '../auth/service.ts';
import { bootstrapTokenMatches, readInstallation } from './bootstrap.ts';

// First-run setup, the command behind the public `setup.complete` procedure
// (#1909): spend the bootstrap token, create the first owner, name the
// instance, and hand back the session that signs the browser in.

export type CompleteSetupInput = {
  token: string;
  instanceName: string;
  owner: { name: string; email: string; password: string };
};

export type SetupFailure =
  /** Already owned, or no installation to set up: `/setup` is not here. */
  | 'closed'
  /** Wrong token, or none outstanding. Never distinguished from each other. */
  | 'unauthorized'
  /** The address has an account whose password the caller did not give. */
  | 'emailTaken';

export class SetupCommandError extends Error {
  readonly reason: SetupFailure;

  constructor(reason: SetupFailure) {
    super(`first-run setup refused: ${reason}`);
    this.name = 'SetupCommandError';
    this.reason = reason;
  }
}

/**
 * Two writes that cannot share a transaction: the account is created through
 * the auth provider's own API, on its own connection, and the ownership mark
 * is an update this application makes. They are ordered so that the window
 * between them is recoverable rather than fatal.
 *
 * The mark is a conditional update that re-checks BOTH the absence of an owner
 * and the token it was authorised by, so two concurrent calls cannot both
 * succeed and a token rotated in between loses.
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
 */
export async function completeSetup(
  deps: { auth: AuthService; pool: pg.Pool },
  input: CompleteSetupInput,
): Promise<EstablishedSession> {
  const installation = await readInstallation(deps.pool);
  // A missing row is an unprovisioned database, not an open instance: there is
  // no token to spend and nothing to mark. It reads as closed, like an owned
  // one, because neither can be set up from here.
  if (!installation || installation.ownerUserId !== null) {
    throw new SetupCommandError('closed');
  }
  if (!bootstrapTokenMatches(input.token, installation.bootstrapTokenHash)) {
    throw new SetupCommandError('unauthorized');
  }

  const session = await establishOwnerSession(deps.auth, input.owner);

  const owned = await deps.pool.query(
    `update installation
        set owner_user_id = $1,
            name = $2,
            bootstrap_token_hash = null,
            bootstrap_token_issued_at = null,
            updated_at = now()
      where id = 1
        and owner_user_id is null
        and bootstrap_token_hash = $3`,
    [session.userId, input.instanceName, installation.bootstrapTokenHash],
  );
  // Somebody else completed setup, or the token was rotated, while this call
  // was creating the account. The account stays — it is a real account whose
  // owner holds the password — but it is not this instance's owner.
  if (owned.rowCount === 0) throw new SetupCommandError('closed');

  return session;
}

async function establishOwnerSession(
  auth: AuthService,
  owner: CompleteSetupInput['owner'],
): Promise<EstablishedSession> {
  const created = await auth.signUpEmail(owner);
  if (created.kind === 'created') return created.session;
  // Auth off means no database or no secret, and `setup.required` is false in
  // both — so this is a deployment fault rather than a refusal, and it leaves
  // as one.
  if (created.kind === 'unavailable') {
    throw new Error('first-run setup reached with auth disabled');
  }

  const adopted = await auth.signInEmail({
    email: owner.email,
    password: owner.password,
  });
  if (adopted.kind === 'refused') throw new SetupCommandError('emailTaken');
  return adopted.session;
}
