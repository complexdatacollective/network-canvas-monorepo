// A pool handle pinned to one team: the only way the data layer runs SQL
// against tenant tables. Every statement runs inside a transaction that
// stamps app.team_id as a transaction-local GUC, which is what the row-level
// security policies read (rls.ts): a statement that forgets its team
// predicate sees nothing rather than another team's rows. The explicit
// predicates stay — they lead the team-first indexes and hold even where RLS
// is bypassed.
import type {
  EffectPgQueryEffectHKT,
  EffectPgQueryResultHKT,
} from 'drizzle-orm/effect-postgres';
import type { PgEffectTransaction } from 'drizzle-orm/pg-core/effect/session';
import type { AnyRelations } from 'drizzle-orm/relations';
import { Context } from 'effect';
import type { SqlClient } from 'effect/unstable/sql';
import pg from 'pg';

import { TEAM_GUC } from './rls.ts';

export type TenantTransactionOptions = {
  isolation?: 'repeatable read';
};

export type TenantDb = {
  readonly teamId: string;
  /** A single statement in its own team-stamped transaction. */
  query(text: string, values?: unknown[]): Promise<pg.QueryResult>;
  transaction<T>(
    work: (client: pg.PoolClient) => Promise<T>,
    opts?: TenantTransactionOptions,
  ): Promise<T>;
};

export function createTenantDb(pool: pg.Pool, teamId: string): TenantDb {
  const transaction = async <T>(
    work: (client: pg.PoolClient) => Promise<T>,
    opts?: TenantTransactionOptions,
  ): Promise<T> => {
    const client = await pool.connect();
    try {
      // SET LOCAL cannot take a bind parameter, so the team id rides the
      // BEGIN round trip as an escaped literal.
      const begin =
        opts?.isolation === 'repeatable read'
          ? 'BEGIN ISOLATION LEVEL REPEATABLE READ'
          : 'BEGIN';
      await client.query(
        `${begin}; SET LOCAL ${TEAM_GUC} = ${pg.escapeLiteral(teamId)}`,
      );
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };

  return {
    teamId,
    query: (text, values) =>
      transaction((client) => client.query(text, values)),
    transaction,
  };
}

// ---------------------------------------------------------------------------
// The Effect tenancy seam (#1927 §9, §10).
//
// `Transaction` and `TeamAccess` are defined **here**, in the package the
// server depends on, rather than in `apps/studio/server/src/db/tenant.ts`
// where the scopes that provide them live. They have to be: `SyncServer`
// (server.ts) writes inside a caller's transaction, so it must be able to
// require the service — and this package cannot import from the app that
// depends on it.
//
// A service tag's identity is the *class*, not its string key, so there can be
// exactly one definition of each. The server re-exports these rather than
// declaring its own; two declarations sharing a key would still be two
// different services, and a transaction provided under one would be invisible
// to code requiring the other.

/**
 * The open transaction. Provided per transaction and never by a layer, which
 * is the job queue's transaction guarantee at the type level: `Jobs.enqueue`
 * requires this service and only a scope provides it, so an effect that writes
 * a row and enqueues a job cannot run outside one.
 */
export class Transaction extends Context.Service<
  Transaction,
  {
    readonly tx: DrizzleTransaction;
    readonly sql: SqlClient.SqlClient;
    /** `null` in a maintenance scope, which stamps no team GUC. */
    readonly teamId: string | null;
  }
>()('@studio/db/Transaction') {}

/** The drizzle handle a transaction body is given. */
export type DrizzleTransaction = PgEffectTransaction<
  EffectPgQueryEffectHKT,
  EffectPgQueryResultHKT,
  AnyRelations
>;

const TeamAccessBrand: unique symbol = Symbol.for('@studio/db/TeamAccess');

/**
 * Proof that the caller may act within a team, and the only key that opens a
 * tenant transaction. Tenancy implies authorization: `TenantScope.open` takes
 * one of these, never a bare team id, so a tenant transaction cannot be opened
 * without a membership check having happened and the compiler says so.
 */
export type TeamAccess = {
  readonly teamId: string;
  readonly role: string;
  readonly [TeamAccessBrand]: typeof TeamAccessBrand;
};

/**
 * Mints a `TeamAccess`. **Not** a general constructor: a source-policy test
 * pins its call sites to the handful of modules that have just proved a
 * membership. Anywhere else it is exactly the hole the branded type closes.
 *
 * @internal
 */
export const unsafeMakeTeamAccess = (
  teamId: string,
  role: string,
): TeamAccess => ({ teamId, role, [TeamAccessBrand]: TeamAccessBrand });
