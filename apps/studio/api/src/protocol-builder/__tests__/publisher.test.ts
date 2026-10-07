import { randomUUID } from 'node:crypto';

import {
  Cause,
  Context,
  Effect,
  Exit,
  Layer,
  Logger,
  type LogLevel,
  Option,
  Predicate,
  Queue,
  Scope,
  Stream,
  type Tracer,
} from 'effect';
import { SqlError } from 'effect/sql';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { type ProtocolEvent } from '@codaco/protocol-builder-core/contract/schemas';
import {
  DraftId,
  ProtocolId,
  TeamId,
} from '@codaco/studio-contract/schema/ids';

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

/** The offsets of `count` events in a row. */
const burst = (count: number) =>
  Array.from({ length: count }, (_, index) => index + 1);

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

const modeOf = (events: readonly ProtocolEvent[], sessionId: string) => {
  const last = events.findLast((event) => event.type === 'presence');
  return last?.type === 'presence'
    ? last.present.find((who) => who.sessionId === sessionId)?.mode
    : undefined;
};

type Logged = { readonly level: LogLevel.LogLevel; readonly text: string };

const sqlFailure = () =>
  new SqlError.SqlError({
    reason: new SqlError.UnknownError({
      cause: new Error('the database went away'),
      message: 'the database went away',
    }),
  });

/** Whether the running effect is inside a span of this name. */
const within = (name: string) =>
  Effect.map(Effect.option(Effect.currentSpan), (current) => {
    let span: Tracer.AnySpan | undefined = Option.getOrUndefined(current);
    while (span !== undefined) {
      if (span._tag === 'Span' && span.name === name) return true;
      span =
        span._tag === 'Span' ? Option.getOrUndefined(span.parent) : undefined;
    }
    return false;
  });

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
      readonly drainStallMs?: number;
      readonly maintenance?: MaintenanceTriggers['Service'];
      readonly database?: Database['Service'];
      readonly studio?: Studio;
      readonly logs?: Logged[];
    } = {},
  ) => {
    const spans = makeSpanCounter();
    const logs = options.logs;
    const relay = ProtocolEvents.layerWith({
      safetyPollMs: options.safetyPollMs ?? NO_POLL_MS,
      ...(options.maxConsecutiveFailures === undefined
        ? {}
        : { maxConsecutiveFailures: options.maxConsecutiveFailures }),
      ...(options.drainStallMs === undefined
        ? {}
        : { drainStallMs: options.drainStallMs }),
    }).pipe(
      Layer.provide(
        logs === undefined
          ? Layer.empty
          : Logger.layer([
              Logger.make(({ logLevel, message }) => {
                const parts: unknown[] = [message].flat();
                logs.push({
                  level: logLevel,
                  text: parts
                    .filter((part) => typeof part === 'string')
                    .join(' '),
                });
              }),
            ]),
      ),
    );
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

  /**
   * The suite's database, running `before` ahead of every transaction begun
   * inside a span named `name`.
   */
  const intercepted = (
    name: string,
    before: Effect.Effect<void, SqlError.SqlError>,
  ) => {
    const real = Context.get(suite.services, Database);
    const transaction: typeof real.db.transaction = (body, config) =>
      Effect.andThen(
        Effect.flatMap(within(name), (hit) => (hit ? before : Effect.void)),
        real.db.transaction(body, config),
      );
    return Database.of({
      ...real,
      db: new Proxy(real.db, {
        get: (target, key, receiver) => {
          if (key === 'transaction') return transaction;
          const value: unknown = Reflect.get(target, key, receiver);
          return value;
        },
      }),
    });
  };

  /** A protocol of the test's own, so what it does to the log stays there. */
  const freshProtocol = async (name: string) => {
    const id = ProtocolId.make(randomUUID());
    await suite.adaRpc.call(
      suite.adaRpc.rpc('protocols.create', {
        teamId: TeamId.make(TEAM_ID),
        name,
        protocolId: id,
        draftId: DraftId.make(randomUUID()),
      }),
    );
    const draft = await suite.runEffect(
      TenantScope.open(suite.access, latestDraftId(TEAM_ID, id)),
    );
    if (draft === undefined) throw new Error(`${name} has no draft`);
    return { protocolId: id, draftId: draft };
  };

  /**
   * Logs release events at these offsets past the draft's last cursor, as
   * though written, without a ring.
   */
  const appendAt = async (ofDraft: string, offsets: ReadonlyArray<number>) => {
    const rows = await teamRows<{ cursor: string }>(
      `INSERT INTO protocol_events (draft_id, team_id, cursor, kind, section_id)
       SELECT $1, $2, last.cursor + n, 'lock', 'settings'
         FROM (SELECT coalesce(max(cursor), 0) AS cursor FROM protocol_events
                WHERE draft_id = $1) AS last,
              unnest($3::int[]) AS n
       RETURNING cursor::text AS cursor`,
      [ofDraft, TEAM_ID, offsets],
    );
    return rows.map((row) => BigInt(row.cursor));
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

  const expectRelayFailed = (exit: Exit.Exit<unknown, unknown>) => {
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isSuccess(exit)) return;
    expect(Cause.hasDies(exit.cause)).toBe(true);
    expect(Predicate.isTagged(Cause.squash(exit.cause), 'RelayFailed')).toBe(
      true,
    );
  };

  /** Every cursor once, in order, with none skipped. */
  const expectContiguous = (events: readonly ProtocolEvent[]) => {
    const cursors = cursorsOf(events);
    const first = cursors[0] ?? 0n;
    expect(cursors).toEqual(cursors.map((_, index) => first + BigInt(index)));
  };

  describe('on one replica', () => {
    it('ends a watcher past its bound without holding back its peers', async () => {
      const { client: a } = await replica({ drainStallMs: 200 });
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
        await appendAt(egolessDraftId, burst(OVERFLOW));
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

    it('holds a burst back until a slow watcher drains, rather than overflowing it', async () => {
      const fresh = await freshProtocol('Burst');
      const lossy = scripted();
      // Never reached, so only the watcher's draining lets the relay read on.
      const { client: b } = await replica({
        doorbell: lossy.doorbell,
        drainStallMs: NO_POLL_MS,
      });
      const taken: ProtocolEvent[] = [];
      let last: bigint | undefined;
      const slow = b.callExit(
        socket('burst'),
        b.rpc('WatchProtocol', { protocolId: fresh.protocolId }).pipe(
          Stream.takeUntil(
            (event) =>
              event.type !== 'presence' &&
              event.cursor !== undefined &&
              BigInt(event.cursor) === last,
          ),
          Stream.runForEach((event) =>
            Effect.promise(async () => {
              taken.push(event);
              await settle(1);
            }),
          ),
        ),
      );
      await until(
        () => taken.some((event) => event.type === 'presence'),
        'the slow watcher’s arrival',
      );
      const cursors = await appendAt(fresh.draftId, burst(OVERFLOW));
      last = cursors.at(-1);
      lossy.send({
        _tag: 'Advanced',
        draftId: fresh.draftId,
        cursor: String(last),
      });
      const exit = await slow;
      expect(Exit.isSuccess(exit)).toBe(true);
      expect(cursorsOf(taken).slice(-OVERFLOW)).toEqual(cursors);
      expectContiguous(taken);
    });

    it('fails its watchers when a cursor stays missing from the log', async () => {
      const fresh = await freshProtocol('Gapped');
      const { client: b } = await replica({
        doorbell: scripted().doorbell,
        safetyPollMs: FAST_POLL_MS,
      });
      const channel = await watching(socket('gapped'), fresh.protocolId, b);
      try {
        const [before, after] = await appendAt(fresh.draftId, [1, 3]);
        const ended = await Promise.race([
          channel.ended,
          settle(5_000).then(() => undefined),
        ]);
        if (ended === undefined) throw new Error('the relay read past the gap');
        expectRelayFailed(ended);
        expect(cursorsOf(channel.events)).toContain(before);
        expect(cursorsOf(channel.events)).not.toContain(after);
      } finally {
        await channel.stop();
      }
    });

    it('gives up a seed its watcher abandoned, and leaves no relay behind', async () => {
      const gate = latch();
      const { client: b, spans } = await replica({
        database: intercepted(
          'protocolBuilder.seedRelay',
          Effect.promise(() => gate.opened),
        ),
      });
      const channel = watch(socket('abandoned'), protocolId, b);
      let stopping: Promise<void> | undefined;
      try {
        await until(
          () => spans.count('protocolBuilder.seedRelay') > 0,
          'the seed to start',
        );
        stopping = channel.stop();
        await until(
          () => spans.ended('protocolBuilder.seedRelay') > 0,
          'the abandoned seed to end while its read is held',
          2_000,
        );
      } finally {
        gate.open();
        await (stopping ?? channel.stop());
      }
      await settle();
      expect(await subscribers(b, draftId)).toBe(0);
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

    it('answers a resync with one read for the team, not one per relay', async () => {
      const first = await freshProtocol('Resynced, first');
      const second = await freshProtocol('Resynced, second');
      const lossy = scripted();
      const { client: b, spans } = await replica({ doorbell: lossy.doorbell });
      const channels = [
        await watching(socket('batched-1'), first.protocolId, b),
        await watching(socket('batched-2'), second.protocolId, b),
      ];
      try {
        await settle();
        const reads = spans.count('protocolBuilder.relayRead');
        const polls = spans.ended('protocolBuilder.relayPoll');
        lossy.send({ _tag: 'Resync' });
        await until(
          () => spans.ended('protocolBuilder.relayPoll') > polls,
          'the resync’s poll',
          3_000,
        );
        await settle();
        expect(spans.ended('protocolBuilder.relayPoll')).toBe(polls + 1);
        expect(spans.count('protocolBuilder.relayRead')).toBe(reads);
      } finally {
        for (const channel of channels) await channel.stop();
      }
    });

    it('keeps polling a team’s other drafts when one draft cannot be read', async () => {
      const broken = await freshProtocol('Unreadable');
      const { client: a } = await replica();
      const { client: b } = await replica({
        doorbell: scripted().doorbell,
        safetyPollMs: FAST_POLL_MS,
        maxConsecutiveFailures: 3,
      });
      const bad = await watching(socket('unreadable'), broken.protocolId, b);
      const good = await watching(
        socket('readable'),
        suite.egolessProtocolId,
        b,
      );
      try {
        // A section no reader can parse, so every read of this draft's log
        // fails, and so does every read that includes it.
        await teamRows(
          `INSERT INTO protocol_events (draft_id, team_id, cursor, kind, section_id)
           SELECT $1, $2, coalesce(max(cursor), 0) + 1, 'lock', 'not-a-section'
             FROM protocol_events WHERE draft_id = $1`,
          [broken.draftId, TEAM_ID],
        );
        expectRelayFailed(await bad.ended);
        const stage = await a.call(
          socket('readable-writer'),
          a.rpc('Create', {
            protocolId: suite.egolessProtocolId,
            requestId: randomUUID(),
            kind: 'stage',
            document: {
              type: 'Information',
              label: 'Polled beside an unreadable draft',
              title: 'Polled beside an unreadable draft',
              items: [],
            },
          }),
        );
        await until(
          () => revisionsOf(good.events, stage.sectionId).length > 0,
          'the readable draft’s write to be polled',
        );
        const open = await Promise.race([
          good.ended.then(() => false),
          settle(FAST_POLL_MS * 4).then(() => true),
        ]);
        expect(open).toBe(true);
      } finally {
        await good.stop();
        await bad.stop();
      }
    });

    it('delivers a rung write while the poll’s read is held up', async () => {
      const gate = latch();
      const writer = scripted();
      const reader = scripted();
      const { client: a } = await replica({ doorbell: writer.doorbell });
      const { client: b, spans } = await replica({
        doorbell: reader.doorbell,
        safetyPollMs: FAST_POLL_MS,
        database: intercepted(
          'protocolBuilder.relayPoll',
          Effect.promise(() => gate.opened),
        ),
      });
      const channel = await watching(socket('unblocked'), protocolId, b);
      try {
        await until(
          () =>
            spans.count('protocolBuilder.relayPoll') >
            spans.ended('protocolBuilder.relayPoll'),
          'a poll to be held up on its read',
        );
        const stage = await createOn(a, 'Rung past a held-up poll');
        await until(
          () => writer.rung.some((ring) => ring._tag === 'Advanced'),
          'the writer to ring',
        );
        for (const ring of writer.rung) reader.send(ring);
        await until(
          () => revisionsOf(channel.events, stage.sectionId).length > 0,
          'the rung write while the poll is held up',
          2_000,
        );
      } finally {
        gate.open();
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

  describe('reaping a lapsed lease', () => {
    it('shows the tab that held it viewing once it is reaped', async () => {
      const { client: a } = await replica({ safetyPollMs: FAST_POLL_MS });
      const holder = socket('lapsed-holder', ADA);
      const owner = `${ADA.principal.userId}:${holder.tab ?? ''}`;
      const stage = await createOn(a, 'Held past its lease');
      const held = await watching(holder, protocolId, a);
      const seer = await watching(socket('lapsed-seer'), protocolId, a);
      const shownAs = () => modeOf(seer.events, holder.connection ?? '');
      try {
        await a.call(
          holder,
          a.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
        );
        await until(
          () => shownAs() === 'editing',
          'the holder to be shown editing',
        );
        // As a replica that stopped would leave it: the socket still live, its
        // lease lapsed, and nobody to give the lease back.
        await ageLeases(owner, -1_000);
        await until(
          async () =>
            (await suite.connectionRows()).some(
              (row) =>
                row.live &&
                row.socket_id === holder.connection &&
                row.mode === 'viewing' &&
                row.section_id === null,
            ),
          'the reaper to show the holder’s row viewing',
        );
        await until(
          () => shownAs() === 'viewing',
          'the watcher to see the holder viewing',
        );
        expect(releasesIn(seer.events, stage.sectionId)).toHaveLength(1);
      } finally {
        await seer.stop();
        await held.stop();
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
                return Effect.fail(sqlFailure());
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
        expectRelayFailed(await channel.ended);
      } finally {
        failing = 0;
        await channel.stop();
      }
    });

    it('retries a failed read long before the poll would', async () => {
      let failures = 0;
      const writer = scripted();
      const reader = scripted();
      const { client: a } = await replica({ doorbell: writer.doorbell });
      const { client: b } = await replica({
        doorbell: reader.doorbell,
        database: intercepted(
          'protocolBuilder.relayRead',
          Effect.suspend(() => {
            if (failures === 0) return Effect.void;
            failures -= 1;
            return Effect.fail(sqlFailure());
          }),
        ),
      });
      const channel = await watching(socket('retried'), protocolId, b);
      try {
        await settle();
        const stage = await createOn(a, 'Read on the retry');
        await until(
          () => writer.rung.some((ring) => ring._tag === 'Advanced'),
          'the writer to ring',
        );
        failures = 1;
        for (const ring of writer.rung) reader.send(ring);
        await until(() => failures === 0, 'the read to fail');
        await until(
          () => revisionsOf(channel.events, stage.sectionId).length > 0,
          'the retried read',
          2_000,
        );
      } finally {
        failures = 0;
        await channel.stop();
      }
    });

    it('reads what it held back once the database reopens, without waiting for the poll', async () => {
      const gate = closable();
      const writer = scripted();
      const reader = scripted();
      const { client: a } = await replica({ doorbell: writer.doorbell });
      const { client: b } = await replica({
        doorbell: reader.doorbell,
        maintenance: gate.triggers,
      });
      const channel = await watching(socket('reopened'), protocolId, b);
      try {
        gate.setClosed(true);
        const stage = await createOn(a, 'Held back while closed');
        await until(
          () => writer.rung.some((ring) => ring._tag === 'Advanced'),
          'the writer to ring',
        );
        for (const ring of writer.rung) reader.send(ring);
        await settle();
        expect(revisionsOf(channel.events, stage.sectionId)).toEqual([]);

        gate.setClosed(false);
        await until(
          () => revisionsOf(channel.events, stage.sectionId).length > 0,
          'the held-back read once the database reopens',
          2_000,
        );
      } finally {
        gate.setClosed(false);
        await channel.stop();
      }
    });

    it('raises repeated reap failures from a warning to an error', async () => {
      const logs: Logged[] = [];
      const { client: writer } = await replica();
      const tab = socket('unreapable', ADA);
      const owner = `${ADA.principal.userId}:${tab.tab ?? ''}`;
      const stage = await createOn(writer, 'Not reaped');
      await writer.call(
        { principal: tab.principal, tab: tab.tab },
        writer.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
      );
      const { client: b } = await replica({
        safetyPollMs: FAST_POLL_MS,
        database: intercepted(
          'protocolBuilder.reap',
          Effect.fail(sqlFailure()),
        ),
        logs,
      });
      const channel = await watching(socket('unreapable-seer'), protocolId, b);
      const reaps = () =>
        logs.filter((log) => log.text.startsWith('Releasing lapsed'));
      try {
        await ageLeases(owner, -1_000);
        await until(() => reaps().length >= 3, 'three failed reaps');
        expect(
          reaps()
            .slice(0, 3)
            .map((log) => log.level),
        ).toEqual(['Warn', 'Warn', 'Error']);
      } finally {
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
