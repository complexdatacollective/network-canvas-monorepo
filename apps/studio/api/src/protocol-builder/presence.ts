// Who is in a protocol, per process.
//
// Ephemeral by decision (#1247): presence has no persistence and no delivery
// guarantee, so it lives here and carries no cursor on the wire. A lock event
// names its holder from the persisted log instead, which is why a second
// process still reports locks correctly.
import { Context, Effect, Layer, Ref, type Scope } from 'effect';

import type { Presence as PresenceValue } from '@codaco/protocol-builder-core/contract/schemas';

type Present = ReadonlyMap<string, ReadonlyMap<string, PresenceValue>>;

const withEntry = (
  present: Present,
  draftId: string,
  presence: PresenceValue,
): Present =>
  new Map(present).set(
    draftId,
    new Map(present.get(draftId)).set(presence.sessionId, presence),
  );

export class Presence extends Context.Service<
  Presence,
  {
    /**
     * Present for as long as the calling scope is open. A connection's
     * presence goes with the connection even though its locks stay: a
     * colleague's cursor cannot outlive the socket it was drawn from.
     */
    readonly join: (
      draftId: string,
      presence: PresenceValue,
    ) => Effect.Effect<void, never, Scope.Scope>;
    /**
     * Records or replaces a connection's presence without tying it to a scope:
     * what a lock taken over a connection does, leaving the removal to that
     * connection's own `join`.
     */
    readonly put: (
      draftId: string,
      presence: PresenceValue,
    ) => Effect.Effect<void>;
    readonly leave: (draftId: string, sessionId: string) => Effect.Effect<void>;
    /** Moves a present connection between viewing and editing one section. */
    readonly setMode: (
      draftId: string,
      sessionId: string,
      mode: PresenceValue['mode'],
      sectionId?: PresenceValue['sectionId'],
    ) => Effect.Effect<void>;
    readonly list: (
      draftId: string,
    ) => Effect.Effect<ReadonlyArray<PresenceValue>>;
  }
>()('@studio/Presence') {
  static readonly layer: Layer.Layer<Presence> = Layer.effect(
    Presence,
    Effect.gen(function* () {
      const present = yield* Ref.make<Present>(new Map());

      const put = (draftId: string, presence: PresenceValue) =>
        Ref.update(present, (current) => withEntry(current, draftId, presence));

      const leave = (draftId: string, sessionId: string) =>
        Ref.update(present, (current) => {
          const inDraft = current.get(draftId);
          if (inDraft?.has(sessionId) !== true) return current;
          const remaining = new Map(inDraft);
          remaining.delete(sessionId);
          const next = new Map(current);
          if (remaining.size === 0) next.delete(draftId);
          else next.set(draftId, remaining);
          return next;
        });

      const join = (draftId: string, presence: PresenceValue) =>
        Effect.acquireRelease(put(draftId, presence), () =>
          leave(draftId, presence.sessionId),
        );

      const setMode = (
        draftId: string,
        sessionId: string,
        mode: PresenceValue['mode'],
        sectionId?: PresenceValue['sectionId'],
      ) =>
        Ref.update(present, (current) => {
          const was = current.get(draftId)?.get(sessionId);
          if (was === undefined) return current;
          return withEntry(current, draftId, {
            sessionId: was.sessionId,
            userId: was.userId,
            displayName: was.displayName,
            mode,
            ...(sectionId === undefined ? {} : { sectionId }),
          });
        });

      const list = (draftId: string) =>
        Ref.get(present).pipe(
          Effect.map((current) => [...(current.get(draftId)?.values() ?? [])]),
        );

      return Presence.of({ join, put, leave, setMode, list });
    }),
  );
}
