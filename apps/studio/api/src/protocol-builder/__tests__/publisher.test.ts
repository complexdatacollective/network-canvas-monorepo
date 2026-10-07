import { randomUUID } from 'node:crypto';

import {
  Cause,
  Context,
  Effect,
  Exit,
  Layer,
  Option,
  Predicate,
  Queue,
  Scope,
  Stream,
} from 'effect';
import { SqlError } from 'effect/sql';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { type ProtocolEvent } from '@codaco/protocol-builder-core/contract/schemas';

import { testDb } from '../../__tests__/support/database.ts';
import {
  ADA,
  GRACE,
  latch,
  revisionsOf,
  setupProtocolBuilderSuite,
  TEAM_ID,
  until,
} from '../../__tests__/support/protocol-builder-suite.ts';
import {
  type Caller,
  createProtocolBuilderClient,
  makeSpanCounter,
  type ProtocolBuilderTestClient,
} from '../../__tests__/support/protocol-builder.ts';
import type { Studio } from '../../app.ts';
import { Database } from '../../db/client.ts';
import { TenantScope } from '../../db/tenant.ts';
import {
  type Closure,
  MaintenanceTriggers,
} from '../../http/middleware/maintenance.ts';
import { latestDraftId } from '../../protocol/store.ts';
import { Doorbell, makeMemoryDoorbell } from '../doorbell.ts';
import { ProtocolEvents } from '../publisher.ts';

type Signal = Stream.Success<Effect.Success<Doorbell['Service']['signals']>>;

type Ring = Parameters<Doorbell['Service']['ring']>[0];

/** Long enough that only a ring, or a test's own poll, can deliver in time. */
const NO_POLL_MS = 60_000;

const FAST_POLL_MS = 100;

/** More events at once than a stalled watcher can hold. */
const OVERFLOW = 2_500;

/** Lets whatever a test just woke run, when there is nothing to wait for. */
const settle = (millis = 300) =>
  new Promise((resolve) => setTimeout(resolve, millis));

const cursorsOf = (events: readonly ProtocolEvent[]) =>
  events.flatMap((event) =>
    event.type === 'presence' || event.cursor === undefined
      ? []
      : [BigInt(event.cursor)],
  );

const releasesIn = (events: readonly ProtocolEvent[], sectionId: string) =>
  events.filter(
    (event) =>
      event.type === 'lock' &&
      event.sectionId === sectionId &&
      event.holder === undefined,
  );

const presentIn = (events: readonly ProtocolEvent[]) => {
  const last = events.findLast((event) => event.type === 'presence');
  return last?.type === 'presence'
    ? last.present.map((who) => who.sessionId)
    : [];
};

/** A doorbell whose signals the test sends, and whose rings it keeps. */
const scripted = () => {
  const signals = Effect.runSync(Queue.unbounded<Signal>());
  const rung: Ring[] = [];
  return {
    doorbell: Doorbell.of({
      ring: (message) =>
        Effect.sync(() => {
          rung.push(message);
        }),
      signals: Effect.succeed(Stream.fromQueue(signals)),
      subscribed: Effect.succeed(true),
    }),
    rung,
    send: (signal: Signal) => {
      Queue.offerUnsafe(signals, signal);
    },
  };
};

const closable = () => {
  let closed = false;
  return {
    triggers: MaintenanceTriggers.of({
      closure: Effect.sync(() =>
        closed
          ? Option.some<Closure>({
              trigger: 'maintenance',
              detail: 'maintenance mode is on',
            })
          : Option.none<Closure>(),
      ),
    }),
    setClosed: (value: boolean) => {
      closed = value;
    },
  };
};

describe.skipIf(!testDb)('the protocol-builder relay', () => {
  const suite = setupProtocolBuilderSuite();
  const { objectStore, teamRows, ageLeases, ageConnections, watch, watching } =
    suite;
  let protocolId: string;
  let draftId: string;
  let egolessDraftId: string;

  const opened: ProtocolBuilderTestClient[] = [];
  const scopes: Scope.Closeable[] = [];
  const pools: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    protocolId = suite.protocolId;
    draftId = suite.draftId;
    const egoless = await suite.runEffect(
      TenantScope.open(
        suite.access,
        latestDraftId(TEAM_ID, suite.egolessProtocolId),
      ),
    );
    if (egoless === undefined) throw new Error('no egoless draft');
    egolessDraftId = egoless;
  });

  afterEach(async () => {
    for (const client of opened.splice(0).reverse()) await client.dispose();
    for (const close of pools.splice(0)) await close();
    for (const scope of scopes.splice(0)) {
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
  });

  /** The in-memory hub two replicas share, as they would one Valkey. */
  const hub = () => {
    const scope = Scope.makeUnsafe();
    scopes.push(scope);
    return Effect.runPromise(Scope.provide(makeMemoryDoorbell, scope));
  };

  const replica = async (
    options: {
      readonly doorbell?: Doorbell['Service'];
      readonly safetyPollMs?: number;
      readonly maxConsecutiveFailures?: number;
      readonly maintenance?: MaintenanceTriggers['Service'];
      readonly database?: Database['Service'];
      readonly studio?: Studio;
    } = {},
  ) => {
    const spans = makeSpanCounter();
    const relay = ProtocolEvents.layerWith({
      safetyPollMs: options.safetyPollMs ?? NO_POLL_MS,
      ...(options.maxConsecutiveFailures === undefined
        ? {}
        : { maxConsecutiveFailures: options.maxConsecutiveFailures }),
    });
    const client = await createProtocolBuilderClient(
      options.studio ?? suite.studio,
      {
        objectStore,
        tracer: spans.tracer,
        events:
          options.database === undefined
            ? relay
            : relay.pipe(
                Layer.provide(Layer.succeed(Database)(options.database)),
              ),
        ...(options.doorbell === undefined
          ? {}
          : { doorbell: options.doorbell }),
        ...(options.maintenance === undefined
          ? {}
          : { maintenance: options.maintenance }),
      },
    );
    opened.push(client);
    return { client, spans };
  };

  const ownPool = async () => {
    const own = await suite.studioOnOwnPool(4);
    pools.push(own.close);
    return own.studio;
  };

  /** A socket no other test uses, so presence and leases are its own. */
  const socket = (slug: string, who = GRACE): Caller => ({
    principal: who.principal,
    connection: `pb-relay-${slug}-connection`,
    tab: `pb-relay-${slug}-tab`,
  });

  const createOn = (over: ProtocolBuilderTestClient, label: string) =>
    suite.createOn(over, label);

  const subscribers = (over: ProtocolBuilderTestClient, ofDraft: string) =>
    over.run(ProtocolEvents.use((events) => events.subscribers(ofDraft)));

  const releasesOf = async (sectionId: string) => {
    const [row] = await teamRows<{ releases: number }>(
      `SELECT count(*)::int AS releases FROM protocol_events
        WHERE draft_id = $1 AND section_id = $2
          AND kind = 'lock' AND owner IS NULL`,
      [draftId, sectionId],
    );
    return row?.releases ?? 0;
  };

  /**
   * Backends waiting on `pid`, directly or in the queue behind another waiter
   * for the same row.
   */
  const waitingOn = async (pid: number) => {
    const first = await suite.blockedBehind(pid);
    const behind = await Promise.all(
      first.map((waiter) => suite.blockedBehind(waiter.pid)),
    );
    return first.length + behind.flat().length;
  };

  /** Every cursor once, in order, with none skipped. */
  const expectContiguous = (events: readonly ProtocolEvent[]) => {
    const cursors = cursorsOf(events);
    const first = cursors[0] ?? 0n;
    expect(cursors).toEqual(cursors.map((_, index) => first + BigInt(index)));
  };

  describe('on one replica', () => {
    it('ends a watcher past its bound without holding back its peers', async () => {
      const { client: a } = await replica();
      const stalled = latch();
      let delivered = 0;
      const slow = a.callExit(
        socket('slow'),
        a.rpc('WatchProtocol', { protocolId: suite.egolessProtocolId }).pipe(
          Stream.runForEach(() =>
            Effect.promise(async () => {
              delivered += 1;
              if (delivered === 1) await stalled.opened;
            }),
          ),
        ),
      );
      const fast = await watching(socket('fast'), suite.egolessProtocolId, a);
      try {
        await until(() => delivered === 1, 'the slow watcher’s first event');
        const before = cursorsOf(fast.events).length;
        // Past the relay's cursor, and more than the stalled watcher's queue
        // and the chunk its stream has already taken hold between them.
        await teamRows(
          `INSERT INTO protocol_events (draft_id, team_id, cursor, kind, section_id)
           SELECT $1, $2, last.cursor + n, 'lock', 'settings'
             FROM (SELECT coalesce(max(cursor), 0) AS cursor FROM protocol_events
                    WHERE draft_id = $1) AS last,
                  generate_series(1, $3::int) AS n`,
          [egolessDraftId, TEAM_ID, OVERFLOW],
        );
        const stage = await a.call(
          socket('fast'),
          a.rpc('Create', {
            protocolId: suite.egolessProtocolId,
            requestId: randomUUID(),
            kind: 'stage',
            document: {
              type: 'Information',
              label: 'Past the bound',
              title: 'Past the bound',
              items: [],
            },
          }),
        );
        await until(
          () => revisionsOf(fast.events, stage.sectionId).length > 0,
          'the fast watcher to read past the bound',
        );
        expect(cursorsOf(fast.events).length - before).toBeGreaterThan(
          OVERFLOW,
        );
        expectContiguous(fast.events);

        stalled.open();
        const exit = await slow;
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) expect(Cause.hasDies(exit.cause)).toBe(true);
      } finally {
        stalled.open();
        await fast.stop();
      }
    });

    it('delivers nothing of a draft nobody here watches', async () => {
      const { client: a } = await replica();
      const channel = await watching(
        socket('elsewhere'),
        suite.egolessProtocolId,
        a,
      );
      try {
        const unwatched = await createOn(a, 'Written where nobody watches');
        const watched = await a.call(
          socket('elsewhere'),
          a.rpc('Create', {
            protocolId: suite.egolessProtocolId,
            requestId: randomUUID(),
            kind: 'stage',
            document: {
              type: 'Information',
              label: 'Watched',
              title: 'Watched',
              items: [],
            },
          }),
        );
        await until(
          () => revisionsOf(channel.events, watched.sectionId).length > 0,
          'the watched write',
        );
        expect(revisionsOf(channel.events, unwatched.sectionId)).toEqual([]);
        expect(await subscribers(a, draftId)).toBe(0);
        expect(await subscribers(a, egolessDraftId)).toBe(1);
      } finally {
        await channel.stop();
      }
    });

    it('starts afresh once the last watcher has left', async () => {
      const { client: a } = await replica();
      const first = await watching(socket('afresh-1'), protocolId, a);
      const second = await watching(socket('afresh-2'), protocolId, a);
      expect(await subscribers(a, draftId)).toBe(2);
      await first.stop();
      await second.stop();
      await until(
        async () => (await subscribers(a, draftId)) === 0,
        'both watchers to leave the relay',
      );

      await createOn(a, 'Written between relays');
      const fresh = await watching(socket('afresh-3'), protocolId, a);
      try {
        const after = await createOn(a, 'Written to the new relay');
        await until(
          () => revisionsOf(fresh.events, after.sectionId).length > 0,
          'the write to reach the new relay',
        );
        expect(revisionsOf(fresh.events, after.sectionId)).toHaveLength(1);
        expect(await subscribers(a, draftId)).toBe(1);
      } finally {
        await fresh.stop();
      }
    });
  });

  describe('across replicas', () => {
    it('brings a write on one replica to a watcher on another by the doorbell, long before the poll', async () => {
      const shared = await hub();
      const { client: a } = await replica({ doorbell: shared });
      const { client: b } = await replica({ doorbell: shared });
      const channel = await watching(socket('rung'), protocolId, b);
      try {
        const stage = await createOn(a, 'Rung across replicas');
        await until(
          () => revisionsOf(channel.events, stage.sectionId).length > 0,
          'the write to reach the other replica',
          2_000,
        );
        expect(revisionsOf(channel.events, stage.sectionId)).toHaveLength(1);
      } finally {
        await channel.stop();
      }
    });

    it('converges by the poll when the doorbell carries nothing', async () => {
      const { client: a } = await replica();
      const { client: b, spans } = await replica({
        doorbell: scripted().doorbell,
        safetyPollMs: FAST_POLL_MS,
      });
      const channel = await watching(socket('polled'), protocolId, b);
      try {
        const polls = spans.ended('protocolBuilder.relayPoll');
        const stage = await createOn(a, 'Found by the poll');
        await until(
          () => revisionsOf(channel.events, stage.sectionId).length > 0,
          'the poll to find the write',
        );
        expect(spans.ended('protocolBuilder.relayPoll')).toBeGreaterThan(polls);
        expectContiguous(channel.events);
      } finally {
        await channel.stop();
      }
    });

    it('catches up in order on a resync after its rings were lost', async () => {
      const { client: a } = await replica();
      const lossy = scripted();
      const { client: b } = await replica({ doorbell: lossy.doorbell });
      const channel = await watching(socket('resync'), protocolId, b);
      try {
        const first = await createOn(a, 'Lost ring, first');
        const second = await createOn(a, 'Lost ring, second');
        await settle();
        expect(revisionsOf(channel.events, first.sectionId)).toEqual([]);

        lossy.send({ _tag: 'Resync' });
        await until(
          () => revisionsOf(channel.events, second.sectionId).length > 0,
          'the resync to read the lost writes',
          2_000,
        );
        expect(revisionsOf(channel.events, first.sectionId)).toHaveLength(1);
        expectContiguous(channel.events);
      } finally {
        await channel.stop();
      }
    });

    it('delivers every cursor in order whatever order the rings arrive in', async () => {
      const writer = scripted();
      const reader = scripted();
      const { client: a } = await replica({ doorbell: writer.doorbell });
      const { client: b } = await replica({ doorbell: reader.doorbell });
      const channel = await watching(socket('reordered'), protocolId, b);
      try {
        const stages = [
          await createOn(a, 'Reordered, first'),
          await createOn(a, 'Reordered, second'),
          await createOn(a, 'Reordered, third'),
        ];
        await until(
          () =>
            writer.rung.filter((ring) => ring._tag === 'Advanced').length >= 3,
          'the writer to ring each write',
        );
        for (const stage of stages) {
          expect(revisionsOf(channel.events, stage.sectionId)).toEqual([]);
        }

        for (const ring of [...writer.rung].reverse()) reader.send(ring);
        await until(
          () =>
            stages.every(
              (stage) =>
                revisionsOf(channel.events, stage.sectionId).length > 0,
            ),
          'every reordered write',
          2_000,
        );
        expectContiguous(channel.events);
      } finally {
        await channel.stop();
      }
    });

    it('shows a change of presence on one replica to a watcher on another', async () => {
      const shared = await hub();
      const { client: a } = await replica({ doorbell: shared });
      const { client: b } = await replica({ doorbell: shared });
      const arriving = socket('arriving', ADA);
      const channel = await watching(socket('present'), protocolId, b);
      try {
        expect(presentIn(channel.events)).not.toContain(arriving.connection);
        const other = await watching(arriving, protocolId, a);
        try {
          await until(
            () => presentIn(channel.events).includes(arriving.connection ?? ''),
            'the arrival on the other replica',
            2_000,
          );
        } finally {
          await other.stop();
        }
        await until(
          () => !presentIn(channel.events).includes(arriving.connection ?? ''),
          'the departure on the other replica',
          2_000,
        );
      } finally {
        await channel.stop();
      }
    });

    it('clears a socket that lapsed on a replica that stopped, without a ring', async () => {
      const { client: a } = await replica();
      const { client: b } = await replica({ safetyPollMs: FAST_POLL_MS });
      const ghost = socket('ghost', ADA);
      const gone = await watching(ghost, protocolId, a);
      const channel = await watching(socket('ghost-seer'), protocolId, b);
      try {
        await until(
          () => presentIn(channel.events).includes(ghost.connection ?? ''),
          'the other replica’s socket to be listed',
        );
        // As the replica that stopped would leave it: lapsed, and unrung.
        await ageConnections({ socketId: ghost.connection }, -1_000);
        await until(
          () => !presentIn(channel.events).includes(ghost.connection ?? ''),
          'the lapsed socket to leave presence',
        );
      } finally {
        await channel.stop();
        await gone.stop();
      }
    });

    it('logs one release for a lease that lapsed on a stopped replica, though two replicas reap it at once', async () => {
      const { client: writer } = await replica();
      const tab = socket('reaped', ADA);
      const owner = `${ADA.principal.userId}:${tab.tab ?? ''}`;
      const stage = await createOn(writer, 'Reaped once');
      const sectionId = stage.sectionId;
      await writer.call(
        { principal: tab.principal, tab: tab.tab },
        writer.rpc('AcquireLock', { protocolId, sectionId }),
      );
      // Each on a pool of its own, so one reaper waiting on the head does not
      // hold back the other's poll for want of a connection.
      const a = await replica({
        safetyPollMs: FAST_POLL_MS,
        studio: await ownPool(),
      });
      const b = await replica({
        safetyPollMs: FAST_POLL_MS,
        studio: await ownPool(),
      });
      const onA = await watching(socket('reaper-a'), protocolId, a.client);
      const onB = await watching(socket('reaper-b'), protocolId, b.client);
      const releases = await releasesOf(sectionId);
      const held = await suite.holdRow(
        'SELECT 1 FROM drafts WHERE id = $1 FOR UPDATE',
        [draftId],
      );
      try {
        await ageLeases(owner, -1_000);
        await until(
          async () =>
            a.spans.count('protocolBuilder.reap') > 0 &&
            b.spans.count('protocolBuilder.reap') > 0 &&
            (await waitingOn(held.pid)) >= 2,
          'both replicas to wait to reap',
        );
        await held.release();
        await until(
          () =>
            releasesIn(onA.events, sectionId).length > 0 &&
            releasesIn(onB.events, sectionId).length > 0,
          'both watchers to see the release',
        );
        await settle();
        expect(await releasesOf(sectionId)).toBe(releases + 1);
        expect(releasesIn(onA.events, sectionId)).toHaveLength(1);
        expect(releasesIn(onB.events, sectionId)).toHaveLength(1);
      } finally {
        await held.release().catch(() => undefined);
        await onB.stop();
        await onA.stop();
      }
    });
  });

  describe('when reading fails or is closed off', () => {
    it('fails its watchers after repeated read failures, and recovers from fewer', async () => {
      const real = Context.get(suite.services, Database);
      let failing = 0;
      const faulty = Database.of({
        ...real,
        db: new Proxy(real.db, {
          get: (target, key, receiver) => {
            const value: unknown = Reflect.get(target, key, receiver);
            if (key !== 'transaction' || failing === 0) return value;
            return () =>
              Effect.suspend(() => {
                failing -= 1;
                return Effect.fail(
                  new SqlError.SqlError({
                    reason: new SqlError.UnknownError({
                      cause: new Error('the database went away'),
                      message: 'the database went away',
                    }),
                  }),
                );
              });
          },
        }),
      });
      const { client: a } = await replica();
      const { client: b } = await replica({
        database: faulty,
        safetyPollMs: FAST_POLL_MS,
        maxConsecutiveFailures: 3,
      });
      const channel = watch(socket('failing'), protocolId, b);
      try {
        await until(
          () => channel.events.some((event) => event.type === 'presence'),
          'the watch to start',
        );
        failing = 2;
        await until(() => failing === 0, 'two reads to fail');
        const stage = await createOn(a, 'Read after two failures');
        await until(
          () => revisionsOf(channel.events, stage.sectionId).length > 0,
          'the relay to recover',
        );

        failing = Number.POSITIVE_INFINITY;
        const exit = await channel.ended;
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isSuccess(exit)) return;
        expect(Cause.hasDies(exit.cause)).toBe(true);
        expect(
          Predicate.isTagged(Cause.squash(exit.cause), 'RelayFailed'),
        ).toBe(true);
      } finally {
        failing = 0;
        await channel.stop();
      }
    });

    it('neither reads nor reaps while the database is closed to it', async () => {
      const shared = await hub();
      const gate = closable();
      const { client: a } = await replica({ doorbell: shared });
      const { client: b, spans } = await replica({
        doorbell: shared,
        safetyPollMs: FAST_POLL_MS,
        maintenance: gate.triggers,
      });
      const channel = await watching(socket('closed'), protocolId, b);
      const names = [
        'protocolBuilder.relayRead',
        'protocolBuilder.relayPoll',
        'protocolBuilder.reap',
      ];
      const counts = () => names.map((name) => spans.count(name));
      try {
        gate.setClosed(true);
        await settle(FAST_POLL_MS * 2);
        const before = counts();
        const stage = await createOn(a, 'Written while closed');
        await settle(FAST_POLL_MS * 4);
        expect(counts()).toEqual(before);
        expect(revisionsOf(channel.events, stage.sectionId)).toEqual([]);

        gate.setClosed(false);
        await until(
          () => revisionsOf(channel.events, stage.sectionId).length > 0,
          'the write once the database reopens',
        );
      } finally {
        gate.setClosed(false);
        await channel.stop();
      }
    });
  });
});
