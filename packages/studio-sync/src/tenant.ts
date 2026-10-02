import type {
  EffectPgQueryEffectHKT,
  EffectPgQueryResultHKT,
} from 'drizzle-orm/effect-postgres';
import type { PgEffectTransaction } from 'drizzle-orm/pg-core/effect/session';
import type { AnyRelations } from 'drizzle-orm/relations';
import { Context } from 'effect';
import type { SqlClient } from 'effect/sql';

// Defined here rather than in apps/studio/api: server.ts requires these services,
// and this package cannot import from the app that depends on it.

/**
 * Provided per transaction and never by a layer, so `Jobs.enqueue` cannot run outside one.
 */
export class Transaction extends Context.Service<
  Transaction,
  {
    readonly tx: DrizzleTransaction;
    readonly sql: SqlClient.SqlClient;
    readonly teamId: string | null;
  }
>()('@studio/db/Transaction') {}

export type DrizzleTransaction = PgEffectTransaction<
  EffectPgQueryEffectHKT,
  EffectPgQueryResultHKT,
  AnyRelations
>;

const TeamAccessBrand: unique symbol = Symbol.for('@studio/db/TeamAccess');

/**
 * Proof that the caller may act within a team; `TenantScope.open` takes one of these,
 * never a bare team id.
 */
export type TeamAccess = {
  readonly teamId: string;
  readonly role: string;
  readonly [TeamAccessBrand]: typeof TeamAccessBrand;
};

/**
 * Not a general constructor: its call sites are pinned by
 * `apps/studio/api/src/db/__tests__/team-access-policy.test.ts`.
 * @internal
 */
export const unsafeMakeTeamAccess = (
  teamId: string,
  role: string,
): TeamAccess => ({ teamId, role, [TeamAccessBrand]: TeamAccessBrand });
