import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type pg from 'pg';

// First-run bootstrap (#1909). A brand-new instance has no owner and no way to
// authenticate anybody, so the schema step — the one command an operator runs
// before the stack serves anything — issues a single-use token and prints it.
// `/setup` spends it to create the first owner account and name the instance.
//
// The token lives in the database as a sha256 hash and in the operator's
// terminal as the only copy of the value. Losing it is recoverable: running
// the schema step again against a still-ownerless database rotates the token
// and prints the new one (recorded decision, 2026-09-15). Running it against
// an owned database prints nothing and stores nothing, so an instance that has
// been set up can never be captured by re-running a deploy command.

/** 32 CSPRNG bytes, base64url: 43 characters, no padding, URL and shell safe. */
const TOKEN_BYTES = 32;

export type BootstrapTokenOutcome =
  /** The token, for the one moment it exists outside the operator's terminal. */
  | { kind: 'issued'; token: string }
  /** Someone already owns this instance; nothing was written. */
  | { kind: 'owned' };

export type Installation = {
  /** The instance's name, null until `/setup` stores one. */
  name: string | null;
  /** The first owner; null while first-run setup is still open. */
  ownerUserId: string | null;
  /** sha256 hex of the outstanding token, null when there is none. */
  bootstrapTokenHash: string | null;
};

/**
 * The installation row, or null on a database whose row was never created —
 * a scratch schema, or a database provisioned by DDL alone. Callers treat
 * null as "no owner and no token": setup is open and no token is spendable,
 * which is what such a database actually offers.
 */
export async function readInstallation(
  db: pg.Pool | pg.PoolClient,
): Promise<Installation | null> {
  const result = await db.query<{
    name: string | null;
    owner_user_id: string | null;
    bootstrap_token_hash: string | null;
  }>(
    'select name, owner_user_id, bootstrap_token_hash from installation where id = 1',
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    name: row.name,
    ownerUserId: row.owner_user_id,
    bootstrapTokenHash: row.bootstrap_token_hash,
  };
}

export function hashBootstrapToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Whether a presented token is the outstanding one, in constant time.
 *
 * Both sides are sha256 hex of the same fixed length, so the comparison never
 * falls back to a length check that would leak through timing; an installation
 * with no outstanding token refuses everything.
 */
export function bootstrapTokenMatches(
  presented: string,
  storedHash: string | null,
): boolean {
  if (storedHash === null) return false;
  const presentedHash = Buffer.from(hashBootstrapToken(presented), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  if (presentedHash.length !== stored.length) return false;
  return timingSafeEqual(presentedHash, stored);
}

/**
 * Creates the installation row if it is missing, then arms it with a fresh
 * token — unless it already has an owner, in which case nothing is written.
 *
 * Run by the schema step, on the connecting login: the application roles hold
 * no INSERT on this table precisely so that arming an instance is not
 * something the server itself can do.
 */
export async function issueBootstrapToken(
  pool: pg.Pool,
): Promise<BootstrapTokenOutcome> {
  await pool.query(
    'insert into installation (id) values (1) on conflict (id) do nothing',
  );

  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const armed = await pool.query(
    `update installation
        set bootstrap_token_hash = $1,
            bootstrap_token_issued_at = now(),
            updated_at = now()
      where id = 1 and owner_user_id is null`,
    [hashBootstrapToken(token)],
  );

  return armed.rowCount === 0 ? { kind: 'owned' } : { kind: 'issued', token };
}

const RULE = '─'.repeat(72);

/**
 * Prints the token where an operator reading a deploy log will see it, and
 * says what to do with it. Prints nothing for an owned installation: there is
 * no token, and a line saying so would be noise on every later deploy.
 *
 * `publicUrl` is `PUBLIC_URL` where the process has one. Without it the path
 * is still named, because an operator running the schema step from a one-shot
 * container knows their own hostname and Studio does not.
 */
export function printBootstrapToken(
  outcome: BootstrapTokenOutcome,
  publicUrl?: string,
): void {
  if (outcome.kind === 'owned') return;
  const destination = publicUrl
    ? `${publicUrl.replace(/\/+$/, '')}/setup`
    : '/setup on this instance';
  const lines = [
    RULE,
    'FIRST-RUN SETUP TOKEN',
    '',
    `  ${outcome.token}`,
    '',
    `Open ${destination} and enter it to create the first owner`,
    'account and name this instance.',
    '',
    'This is the only time it is shown. Run the schema step again to issue a',
    'new one; once an owner exists, no token is issued and setup is closed.',
    RULE,
  ];
  // oxlint-disable-next-line no-console -- the operator-facing output this exists to produce
  console.log(lines.join('\n'));
}
