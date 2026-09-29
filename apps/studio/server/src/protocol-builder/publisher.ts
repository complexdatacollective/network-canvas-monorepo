// Live fan-out, one process wide. Every commit, lock change and presence change
// reaches the watchers this process is serving; the deployment assumption is
// the ADR's single WebSocket-serving replica (#1247), and the replay path is
// what makes a second one a scaling limit rather than a correctness one.
//
// One bounded queue per subscriber rather than one `PubSub` per draft: a
// bounded `PubSub` is a single ring shared by its subscribers, so the slowest
// one filling it drops the event for every subscriber (`dropping`) or stalls
// the publisher (`bounded`). A queue each keeps a slow watcher's backlog its
// own.
import {
  Cause,
  Context,
  Effect,
  Layer,
  Queue,
  Ref,
  Schema,
  type Scope,
  Stream,
} from 'effect';

import type { LoggedProtocolEvent } from './events.ts';

const QUEUE_LIMIT = 1024;

/**
 * A watcher too far behind to catch up cheaply. It is dropped to the replay
 * path rather than buffered without limit: its stream ends with this, and the
 * client resumes from the last cursor it saw.
 */
export class SubscriberOverflow extends Schema.TaggedError<SubscriberOverflow>()(
  'SubscriberOverflow',
  { draftId: Schema.String },
) {}

type Subscriber = Queue.Queue<
  LoggedProtocolEvent,
  SubscriberOverflow | Cause.Done
>;

export class ProtocolEvents extends Context.Service<
  ProtocolEvents,
  {
    /** Never waits on a subscriber, however far behind it is. */
    readonly publish: (
      draftId: string,
      entries: ReadonlyArray<LoggedProtocolEvent>,
    ) => Effect.Effect<void>;
    /**
     * Subscribes now, and hands back the events published from here on for as
     * long as the calling scope is open — so a caller that subscribes before
     * reading the backlog loses nothing committed in between.
     */
    readonly subscribe: (
      draftId: string,
    ) => Effect.Effect<
      Stream.Stream<LoggedProtocolEvent, SubscriberOverflow>,
      never,
      Scope.Scope
    >;
  }
>()('@studio/ProtocolEvents') {
  static readonly layer: Layer.Layer<ProtocolEvents> = Layer.effect(
    ProtocolEvents,
    Effect.gen(function* () {
      const drafts = yield* Ref.make<
        ReadonlyMap<string, ReadonlySet<Subscriber>>
      >(new Map());

      const publish = (
        draftId: string,
        entries: ReadonlyArray<LoggedProtocolEvent>,
      ) =>
        Ref.get(drafts).pipe(
          Effect.map((current) => {
            for (const subscriber of current.get(draftId) ?? []) {
              for (const entry of entries) {
                if (Queue.offerUnsafe(subscriber, entry)) continue;
                // Past the bound, or already overflowed: the events it has are
                // still delivered, and then its stream fails.
                Queue.failCauseUnsafe(
                  subscriber,
                  Cause.fail(new SubscriberOverflow({ draftId })),
                );
                break;
              }
            }
          }),
        );

      const subscribe = (draftId: string) =>
        Effect.acquireRelease(
          Effect.gen(function* () {
            const subscriber = yield* Queue.bounded<
              LoggedProtocolEvent,
              SubscriberOverflow | Cause.Done
            >(QUEUE_LIMIT);
            yield* Ref.update(drafts, (current) =>
              new Map(current).set(
                draftId,
                new Set(current.get(draftId)).add(subscriber),
              ),
            );
            return subscriber;
          }),
          (subscriber) =>
            Ref.update(drafts, (current) => {
              const remaining = new Set(current.get(draftId));
              remaining.delete(subscriber);
              const next = new Map(current);
              if (remaining.size === 0) next.delete(draftId);
              else next.set(draftId, remaining);
              return next;
            }).pipe(Effect.andThen(Queue.shutdown(subscriber))),
        ).pipe(Effect.map(Stream.fromQueue));

      return ProtocolEvents.of({ publish, subscribe });
    }),
  );
}
