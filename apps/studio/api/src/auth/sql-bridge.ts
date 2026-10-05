import { PgClient } from '@effect/sql-pg';
import { Context, Effect, Semaphore } from 'effect';
import type { SqlError } from 'effect/sql';

import { Database } from '../db/client.ts';
import { UntenantedScope } from '../db/tenant.ts';

// Every statement runs through the `PgClient` this bridge captured, never a
// second client: `SqlClient` keys its transaction connection per client
// instance, so another client would escape the transaction.

type BridgedEffect<A> = Effect.Effect<A, SqlError.SqlError, PgClient.PgClient>;

export type SqlBridge = {
  readonly run: <A>(effect: BridgedEffect<A>) => Promise<A>;
  readonly transaction: <A>(
    body: (bridge: SqlBridge) => Promise<A>,
  ) => Promise<A>;
};

type BridgeContext = Database | PgClient.PgClient;

/**
 * One permit per transaction: a Postgres connection cannot multiplex, and
 * better-auth's callback is free to `Promise.all` two adapter calls.
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
  run: (effect) => Effect.runPromiseWith(context)(effect),
  transaction: (body) =>
    Effect.runPromiseWith(context)(
      UntenantedScope.open(
        Effect.flatMap(Effect.context<BridgeContext>(), (inner) =>
          Effect.tryPromise({
            try: () => body(transactionBridge(inner)),
            // better-auth reads its own error classes off a rejection.
            catch: (cause) => cause,
          }),
        ),
      ),
    ),
});

export const makeSqlBridge: Effect.Effect<SqlBridge, never, Database> =
  Database.useSync((database) =>
    rootBridge(
      Context.make(Database, database).pipe(
        Context.add(PgClient.PgClient, database.sql),
      ),
    ),
  );
