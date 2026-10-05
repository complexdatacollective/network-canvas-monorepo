// One bounded queue per subscriber rather than one `PubSub` per draft: a
// bounded `PubSub` is a single ring, so the slowest subscriber drops the event
// for every subscriber or stalls the publisher.
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
    readonly publish: (
      draftId: string,
      entries: ReadonlyArray<LoggedProtocolEvent>,
    ) => Effect.Effect<void>;
    readonly subscribe: (
      draftId: string,
    ) => Effect.Effect<
      Stream.Stream<LoggedProtocolEvent, SubscriberOverflow>,
      never,
      Scope.Scope
    >;
    readonly subscribers: (draftId: string) => Effect.Effect<number>;
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

      const subscribers = (draftId: string) =>
        Effect.map(
          Ref.get(drafts),
          (current) => current.get(draftId)?.size ?? 0,
        );

      return ProtocolEvents.of({ publish, subscribe, subscribers });
    }),
  );
}
