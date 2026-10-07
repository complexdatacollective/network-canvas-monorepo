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
    readonly join: (
      draftId: string,
      presence: PresenceValue,
    ) => Effect.Effect<void, never, Scope.Scope>;
    readonly put: (
      draftId: string,
      presence: PresenceValue,
    ) => Effect.Effect<void>;
    readonly leave: (draftId: string, sessionId: string) => Effect.Effect<void>;
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
