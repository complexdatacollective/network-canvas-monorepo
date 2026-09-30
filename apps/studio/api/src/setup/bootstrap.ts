import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';
import { SETUP_TABLES } from './schema.ts';

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
//
// Which identity runs which statement is the security property, and it is the
// scope each caller opens rather than a convention: `issueBootstrapToken` is
// run by the schema step on the **connecting login**, because neither
// application role holds INSERT on `installation` precisely so that arming an
// instance is not something the server itself can do.

const { installation } = SETUP_TABLES;

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
 * The installation row, or null on a database whose row was never created — a
 * scratch schema, or a database provisioned by DDL alone. Callers treat null
 * as "no owner and no token": setup is open and no token is spendable, which
 * is what such a database actually offers.
 */
export const readInstallation: () => Effect.Effect<
  Installation | null,
  SqlError.SqlError,
  Transaction
> = Effect.fn('setup.readInstallation')(function* () {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select({
      name: installation.name,
      ownerUserId: installation.ownerUserId,
      bootstrapTokenHash: installation.bootstrapTokenHash,
    })
    .from(installation)
    .where(eq(installation.id, 1));
  return rows[0] ?? null;
}, sqlErrorsOnly);

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
 * Runs inside the caller's transaction, and the caller is the schema step,
 * which opens an `OwnerScope`. The application roles hold no INSERT on this
 * table, so the same statements run by the server would be refused by the
 * database rather than by a check here.
 */
export const issueBootstrapToken: () => Effect.Effect<
  BootstrapTokenOutcome,
  SqlError.SqlError,
  Transaction
> = Effect.fn('setup.issueBootstrapToken')(function* () {
  const { tx } = yield* Transaction;
  yield* tx
    .insert(installation)
    .values({ id: 1 })
    .onConflictDoNothing({ target: installation.id })
    .returning({ id: installation.id });

  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  // `.returning()` is what makes the `owned` branch real: without it the
  // builder answers with the driver's own result object, typed as a row array
  // and not one, so an owned instance would read as freshly armed and the
  // operator would be handed a token that spends nothing.
  const armed = yield* tx
    .update(installation)
    .set({
      bootstrapTokenHash: hashBootstrapToken(token),
      bootstrapTokenIssuedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    // The ownerlessness is a predicate on the write, not a prior read: two
    // schema steps racing must not both arm, and an instance claimed between a
    // read and this write must not be re-armed at all.
    .where(and(eq(installation.id, 1), isNull(installation.ownerUserId)))
    .returning({ id: installation.id });

  return armed.length === 0
    ? { kind: 'owned' as const }
    : { kind: 'issued' as const, token };
}, sqlErrorsOnly);

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
