import { PgClient } from '@effect/sql-pg';
import { Context, Effect, Semaphore } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import { Database } from '../db/client.ts';
import { UntenantedScope } from '../db/tenant.ts';

// better-auth is a Promise API, and every adapter call has to become one. This
// is the only place that crosses (#1927 §12, S6 §3).
//
// **One client value.** Every statement the adapter builds runs through the
// `PgClient` this bridge captured, which is `Database.sql` itself — not a
// second client over the same URL. `SqlClient` keys its transaction connection
// per client instance, so a statement issued through another client inside
// this one's transaction would silently take a pooled connection of its own
// and escape the transaction (`db/client.ts` says why at more length).
//
// **Pinned, always.** On rc.115 a statement outside a transaction runs as the
// connecting login rather than the application role, and without the suites'
// `search_path` (fallback A, #1927 §20 Q6). So nothing the adapter runs is
// bare: an operation outside better-auth's `transaction()` opens its own
// `UntenantedScope` — one pinned transaction around one statement — and
// `transaction()` opens one around the whole callback. The auth tables carry no
// tenant policy, so an untenanted scope reaches them exactly as far as the
// application role's grants allow, which is the point.

/** What an adapter statement is: one Effect on the captured client. */
type BridgedEffect<A> = Effect.Effect<A, SqlError.SqlError, PgClient.PgClient>;

export type SqlBridge = {
  /**
   * One adapter operation, on whatever connection the bridge is pinned to: a
   * transaction of its own at the root, the open transaction's connection
   * inside `transaction`.
   */
  readonly run: <A>(effect: BridgedEffect<A>) => Promise<A>;
  /**
   * One real Postgres transaction; `body` gets a bridge pinned to its
   * connection. A failure anywhere in `body` — a rejected statement or a throw
   * of better-auth's own — rolls the whole of it back and rejects with that
   * failure.
   */
  readonly transaction: <A>(
    body: (bridge: SqlBridge) => Promise<A>,
  ) => Promise<A>;
};

type BridgeContext = Database | PgClient.PgClient;

/**
 * The bridge inside a transaction: every `run` lands on the connection the
 * captured context carries.
 *
 * One permit per transaction, because a Postgres connection cannot multiplex
 * and better-auth's callback is free to `Promise.all` two adapter calls; the
 * permit makes them run one after the other rather than interleave on one
 * socket. A `transaction` asked for here joins the one already open: the
 * adapter's own transaction adapter is built with `transaction: false`, so
 * nothing better-auth does reaches it, and a savepoint would buy a caller
 * nothing it asked for.
 */
const transactionBridge = (
  context: Context.Context<BridgeContext>,
): SqlBridge => {
  const permit = Semaphore.makeUnsafe(1);
  const bridge: SqlBridge = {
    run: (effect) =>
      Effect.runPromiseWith(context)(Semaphore.withPermit(permit, effect)),
    transaction: (body) => body(bridge),
  };
  return bridge;
};

const rootBridge = (context: Context.Context<BridgeContext>): SqlBridge => ({
  run: (effect) => Effect.runPromiseWith(context)(UntenantedScope.open(effect)),
  transaction: (body) =>
    Effect.runPromiseWith(context)(
      UntenantedScope.open(
        Effect.flatMap(Effect.context<BridgeContext>(), (inner) =>
          Effect.tryPromise({
            try: () => body(transactionBridge(inner)),
            // better-auth reads its own error classes off a rejection, so the
            // failure leaves exactly as it arrived.
            catch: (cause) => cause,
          }),
        ),
      ),
    ),
});

/**
 * A bridge over the application client. The context is captured once, so every
 * operation runs with the services of whoever built the bridge rather than
 * those of the request that caused it — the adapter's spans are roots, not the
 * procedure's children (S6 §9).
 */
export const makeSqlBridge: Effect.Effect<SqlBridge, never, Database> =
  Database.useSync((database) =>
    rootBridge(
      Context.make(Database, database).pipe(
        Context.add(PgClient.PgClient, database.sql),
      ),
    ),
  );
