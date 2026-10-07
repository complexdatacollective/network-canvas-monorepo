import { Context, Effect, Layer } from 'effect';
import type { SqlError } from 'effect/sql';

import type { Presence as PresenceValue } from '@codaco/protocol-builder-core/contract/schemas';
import type { ProtocolSectionId } from '@codaco/studio-sync/taxonomy';

import { Database } from '../db/client.ts';
import { livePresence, setSocketMode } from './connections.ts';
import type { ProtocolBuilderSession } from './host.ts';

/**
 * Who is on a protocol, read from the connection rows every replica keeps, so
 * a colleague connected through another replica is listed too. Joining and
 * leaving are `Leases.connect`'s: a watch's row is its presence.
 */
export class Presence extends Context.Service<
  Presence,
  {
    readonly setMode: (
      session: ProtocolBuilderSession,
      mode: PresenceValue['mode'],
      sectionId?: ProtocolSectionId,
    ) => Effect.Effect<void, SqlError.SqlError>;
    readonly list: (
      session: ProtocolBuilderSession,
    ) => Effect.Effect<ReadonlyArray<PresenceValue>, SqlError.SqlError>;
  }
>()('@studio/Presence') {
  static readonly layer: Layer.Layer<Presence, never, Database> = Layer.effect(
    Presence,
    Effect.gen(function* () {
      const database = yield* Database;
      const withDatabase = Effect.provideService(Database, database);

      const setMode = (
        session: ProtocolBuilderSession,
        mode: PresenceValue['mode'],
        sectionId?: ProtocolSectionId,
      ) => withDatabase(setSocketMode(session, mode, sectionId));

      const list = (session: ProtocolBuilderSession) =>
        withDatabase(livePresence(session.access, [session.draftId])).pipe(
          Effect.map((present) => present.get(session.draftId) ?? []),
        );

      return Presence.of({ setMode, list });
    }),
  );
}
