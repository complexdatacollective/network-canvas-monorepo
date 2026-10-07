import { Context, Effect, Layer } from 'effect';
import type { SqlError } from 'effect/sql';

import { Database } from '../db/client.ts';
import { setSocketMode } from './connections.ts';
import type { ProtocolBuilderSession } from './host.ts';

/**
 * What a socket shows its colleagues. A watch's connection row is its
 * presence: joining and leaving are `Leases.connect`'s, and every replica's
 * relay lists who is present from those rows.
 */
export class Presence extends Context.Service<
  Presence,
  {
    /** Records the socket's mode from the leases its tab holds now. */
    readonly setMode: (
      session: ProtocolBuilderSession,
    ) => Effect.Effect<void, SqlError.SqlError>;
  }
>()('@studio/Presence') {
  static readonly layer: Layer.Layer<Presence, never, Database> = Layer.effect(
    Presence,
    Effect.gen(function* () {
      const database = yield* Database;
      const withDatabase = Effect.provideService(Database, database);

      const setMode = (session: ProtocolBuilderSession) =>
        withDatabase(setSocketMode(session));

      return Presence.of({ setMode });
    }),
  );
}
