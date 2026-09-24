import type {
  EffectPgQueryEffectHKT,
  EffectPgQueryResultHKT,
} from 'drizzle-orm/effect-postgres';
import type { PgEffectTransaction } from 'drizzle-orm/pg-core/effect/session';
import type { AnyRelations } from 'drizzle-orm/relations';
import { Context } from 'effect';
import type { SqlClient } from 'effect/unstable/sql';

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
