import { describe, expect, it } from '@effect/vitest';
import { Effect, Exit, Scope } from 'effect';
import { TestClock } from 'effect/testing';

import type { Lease } from '@codaco/studio-sync/server';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import {
  IDLE_MS,
  Leases,
  RECONNECT_GRACE_MS,
  RENEW_INTERVAL_MS,
} from '../leases.ts';

const SETTINGS: ProtocolSectionId = sectionId({ kind: 'settings' });
const LEASE: Lease = { epoch: 1n, expiresAt: new Date(0) };

/** A renewal that counts its calls and answers with whatever `answer` says. */
function renewal(
  answer: (call: number) => Effect.Effect<Lease | null, unknown>,
) {
  let calls = 0;
  return {
    calls: () => calls,
    renew: Effect.suspend(() => {
      calls += 1;
      return answer(calls);
    }),
  };
}

const open = Effect.fnUntraced(function* (
  owner: string,
  end: Effect.Effect<void> = Effect.void,
) {
  const leases = yield* Leases;
  const scope = yield* Scope.make();
  yield* leases.connect(owner, 'draft', end).pipe(Scope.provide(scope));
  return Scope.close(scope, Exit.void);
});

describe('Leases', () => {
  // Mutation: drop the `forkScoped` renewal fiber (or skip a tick) → fewer
  // than three renewals in thirty seconds.
  it.effect(
    'renews a held lease every interval while a connection is open',
    () =>
      Effect.gen(function* () {
        const leases = yield* Leases;
        yield* open('tab');
        const counter = renewal(() => Effect.succeed(LEASE));
        yield* leases.hold({
          renew: counter.renew,
          draftId: 'draft',
          sectionId: SETTINGS,
          owner: 'tab',
        });

        yield* TestClock.adjust(RENEW_INTERVAL_MS - 1);
        expect(counter.calls()).toBe(0);
        yield* TestClock.adjust(1);
        expect(counter.calls()).toBe(1);
        yield* TestClock.adjust(2 * RENEW_INTERVAL_MS);
        expect(counter.calls()).toBe(3);
        expect(yield* leases.heldSections('draft', 'tab')).toEqual([SETTINGS]);
      }).pipe(Effect.provide(Leases.layer)),
  );

  // Mutation: forget the entry on a failed renewal → the second tick never
  // asks and the section is no longer held.
  it.effect('keeps a lease whose renewal went unanswered and asks again', () =>
    Effect.gen(function* () {
      const leases = yield* Leases;
      yield* open('tab');
      const counter = renewal((call) =>
        call === 1
          ? Effect.fail(new Error('unreachable'))
          : Effect.succeed(LEASE),
      );
      yield* leases.hold({
        renew: counter.renew,
        draftId: 'draft',
        sectionId: SETTINGS,
        owner: 'tab',
      });

      yield* TestClock.adjust(RENEW_INTERVAL_MS);
      expect(counter.calls()).toBe(1);
      expect(yield* leases.heldSections('draft', 'tab')).toEqual([SETTINGS]);
      yield* TestClock.adjust(RENEW_INTERVAL_MS);
      expect(counter.calls()).toBe(2);
      expect(yield* leases.heldSections('draft', 'tab')).toEqual([SETTINGS]);
    }).pipe(Effect.provide(Leases.layer)),
  );

  it.effect('drops a lease whose renewal answers that it is gone', () =>
    Effect.gen(function* () {
      const leases = yield* Leases;
      yield* open('tab');
      const counter = renewal(() => Effect.succeed(null));
      yield* leases.hold({
        renew: counter.renew,
        draftId: 'draft',
        sectionId: SETTINGS,
        owner: 'tab',
      });

      yield* TestClock.adjust(RENEW_INTERVAL_MS);
      expect(yield* leases.heldSections('draft', 'tab')).toEqual([]);
      yield* TestClock.adjust(RENEW_INTERVAL_MS);
      expect(counter.calls()).toBe(1);
    }).pipe(Effect.provide(Leases.layer)),
  );

  // Mutation: sleep `RECONNECT_GRACE_MS - 1000` before ending → `end` has
  // already run one second early.
  it.effect(
    'ends a stranded owner exactly when the reconnect grace runs out',
    () =>
      Effect.gen(function* () {
        const leases = yield* Leases;
        let ended = 0;
        const close = yield* open(
          'tab',
          Effect.sync(() => {
            ended += 1;
          }),
        );
        yield* TestClock.adjust(3_000);
        yield* close;

        yield* TestClock.adjust(RECONNECT_GRACE_MS - 1);
        expect(ended).toBe(0);
        expect(yield* leases.connected('tab')).toBe(true);
        yield* TestClock.adjust(1);
        expect(ended).toBe(1);
        expect(yield* leases.connected('tab')).toBe(false);
        yield* TestClock.adjust(RECONNECT_GRACE_MS * 3);
        expect(ended).toBe(1);
      }).pipe(Effect.provide(Leases.layer)),
  );

  it.effect('does not end an owner that reconnects within the grace', () =>
    Effect.gen(function* () {
      const leases = yield* Leases;
      let ended = 0;
      const end = Effect.sync(() => {
        ended += 1;
      });
      const first = yield* open('tab', end);
      yield* first;
      yield* TestClock.adjust(RECONNECT_GRACE_MS - 1_000);
      const second = yield* open('tab', end);
      yield* TestClock.adjust(RECONNECT_GRACE_MS * 3);
      expect(ended).toBe(0);
      expect(yield* leases.connected('tab')).toBe(true);

      yield* second;
      yield* TestClock.adjust(RECONNECT_GRACE_MS);
      expect(ended).toBe(1);
    }).pipe(Effect.provide(Leases.layer)),
  );

  // Mutation: leave the running grace alone when the owner reconnects → the
  // first disconnect's grace ends the owner five seconds after the second.
  it.effect(
    'times a second disconnect’s grace from that disconnect, not the first',
    () =>
      Effect.gen(function* () {
        let ended = 0;
        const end = Effect.sync(() => {
          ended += 1;
        });
        const first = yield* open('tab', end);
        yield* first;
        yield* TestClock.adjust(10_000);
        const second = yield* open('tab', end);
        yield* TestClock.adjust(5_000);
        yield* second;

        yield* TestClock.adjust(RECONNECT_GRACE_MS - 1);
        expect(ended).toBe(0);
        yield* TestClock.adjust(1);
        expect(ended).toBe(1);
      }).pipe(Effect.provide(Leases.layer)),
  );

  it.effect(
    'keeps an owner connected while any of its connections is open',
    () =>
      Effect.gen(function* () {
        const leases = yield* Leases;
        let ended = 0;
        const end = Effect.sync(() => {
          ended += 1;
        });
        const first = yield* open('tab', end);
        yield* open('tab', end);
        yield* first;
        yield* TestClock.adjust(RECONNECT_GRACE_MS * 3);
        expect(ended).toBe(0);
        expect(yield* leases.connected('tab')).toBe(true);
      }).pipe(Effect.provide(Leases.layer)),
  );

  // Mutation: drop the `!open.has(owner)` idle check → the lease is still
  // renewed after the idle bound.
  it.effect(
    'forgets the leases of an owner with no connection after the idle bound',
    () =>
      Effect.gen(function* () {
        const leases = yield* Leases;
        const counter = renewal(() => Effect.succeed(LEASE));
        yield* leases.hold({
          renew: counter.renew,
          draftId: 'draft',
          sectionId: SETTINGS,
          owner: 'script',
        });

        yield* TestClock.adjust(IDLE_MS);
        expect(yield* leases.heldSections('draft', 'script')).toEqual([
          SETTINGS,
        ]);
        const renewedWhileIdle = counter.calls();
        expect(renewedWhileIdle).toBe(IDLE_MS / RENEW_INTERVAL_MS);

        yield* TestClock.adjust(RENEW_INTERVAL_MS);
        expect(yield* leases.heldSections('draft', 'script')).toEqual([]);
        expect(counter.calls()).toBe(renewedWhileIdle);
      }).pipe(Effect.provide(Leases.layer)),
  );

  it.effect('counts a touch as a sign of life for the idle bound', () =>
    Effect.gen(function* () {
      const leases = yield* Leases;
      const counter = renewal(() => Effect.succeed(LEASE));
      yield* leases.hold({
        renew: counter.renew,
        draftId: 'draft',
        sectionId: SETTINGS,
        owner: 'script',
      });

      yield* TestClock.adjust(IDLE_MS - RENEW_INTERVAL_MS);
      yield* leases.touch('script');
      yield* TestClock.adjust(IDLE_MS);
      expect(yield* leases.heldSections('draft', 'script')).toEqual([SETTINGS]);
      yield* TestClock.adjust(RENEW_INTERVAL_MS);
      expect(yield* leases.heldSections('draft', 'script')).toEqual([]);
    }).pipe(Effect.provide(Leases.layer)),
  );

  // Mutation: remove the `catchCause` around `end` → the failure escapes and
  // the other draft's `end` never runs.
  it.effect('survives an end that fails, and goes on renewing', () =>
    Effect.gen(function* () {
      const leases = yield* Leases;
      let secondEnded = false;
      const scope = yield* Scope.make();
      yield* leases
        .connect('tab', 'draft', Effect.die(new Error('database unreachable')))
        .pipe(Scope.provide(scope));
      yield* leases
        .connect(
          'tab',
          'other',
          Effect.sync(() => {
            secondEnded = true;
          }),
        )
        .pipe(Scope.provide(scope));
      yield* Scope.close(scope, Exit.void);

      yield* open('colleague');
      const counter = renewal(() => Effect.succeed(LEASE));
      yield* leases.hold({
        renew: counter.renew,
        draftId: 'draft',
        sectionId: SETTINGS,
        owner: 'colleague',
      });

      yield* TestClock.adjust(RECONNECT_GRACE_MS);
      expect(secondEnded).toBe(true);
      const before = counter.calls();
      yield* TestClock.adjust(3 * RENEW_INTERVAL_MS);
      expect(counter.calls()).toBe(before + 3);
    }).pipe(Effect.provide(Leases.layer)),
  );
});
