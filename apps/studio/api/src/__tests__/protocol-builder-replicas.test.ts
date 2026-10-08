import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Effect, Stream } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';

import { type ProtocolEvent } from '@codaco/protocol-builder-core/contract/schemas';

import { type Doorbell } from '../protocol-builder/doorbell.ts';
import {
  RECONNECT_GRACE_MS,
  RENEW_INTERVAL_MS,
} from '../protocol-builder/leases.ts';
import { testDb } from './support/database.ts';
import {
  ADA,
  GRACE,
  setupProtocolBuilderSuite,
  until,
} from './support/protocol-builder-suite.ts';
import {
  type Caller,
  createProtocolBuilderReplicas,
  makeShiftableClock,
} from './support/protocol-builder.ts';

/** Long enough that only a ring, or an advanced clock, can deliver in time. */
const NO_POLL_MS = 60_000;

const FAST_POLL_MS = 150;

const RELAY_POLL = 'protocolBuilder.relayPoll';

/** Each replica on a pool of its own, so their transactions overlap. */
const REPLICA_CONNECTIONS = 3;

const cursorsOf = (events: readonly ProtocolEvent[]) =>
  events.flatMap((event) =>
    event.type === 'presence' || event.cursor === undefined
      ? []
      : [BigInt(event.cursor)],
  );

/** Every cursor once, in order, with none skipped. */
const expectContiguous = (events: readonly ProtocolEvent[]) => {
  const cursors = cursorsOf(events);
  const first = cursors[0] ?? 0n;
  expect(cursors).toEqual(cursors.map((_, index) => first + BigInt(index)));
};

const locksIn = (events: readonly ProtocolEvent[], sectionId: string) =>
  events.flatMap((event) =>
    event.type === 'lock' && event.sectionId === sectionId ? [event] : [],
  );

const takenIn = (events: readonly ProtocolEvent[], sectionId: string) =>
  locksIn(events, sectionId).filter((event) => event.holder !== undefined);

const releasesIn = (events: readonly ProtocolEvent[], sectionId: string) =>
  locksIn(events, sectionId).filter((event) => event.holder === undefined);

const presentIn = (events: readonly ProtocolEvent[]) => {
  const last = events.findLast((event) => event.type === 'presence');
  return last?.type === 'presence'
    ? last.present.map((who) => who.sessionId)
    : [];
};

/** A seeded generator, so a run drops and reorders the same way each time. */
const mulberry32 = (seed: number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const shuffled = <A>(items: ReadonlyArray<A>, random: () => number) => {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    const here = out[index];
    const there = out[other];
    if (here === undefined || there === undefined) continue;
    out[index] = there;
    out[other] = here;
  }
  return out;
};

/** A view of the hub that loses half its signals and reorders the rest in threes. */
const lossy = (hub: Doorbell['Service'], random: () => number) => {
  const tally = { dropped: 0, passed: 0 };
  const doorbell: Doorbell['Service'] = {
    ...hub,
    signals: Effect.map(hub.signals, (signals) =>
      signals.pipe(
        Stream.filter(() => {
          const kept = random() >= 0.5;
          if (kept) tally.passed += 1;
          else tally.dropped += 1;
          return kept;
        }),
        Stream.grouped(3),
        Stream.flatMap((group) => Stream.fromIterable(shuffled(group, random))),
      ),
    ),
  };
  return { doorbell, tally };
};

const tabOf = (who: typeof ADA, slug: string) => {
  const socket = `${who.connectionId}-${slug}`;
  const tab = `${who.clientSessionId}-${slug}`;
  const caller: Caller = { principal: who.principal, connection: socket, tab };
  return { caller, socket, owner: `${who.principal.userId}:${tab}` };
};

describe.skipIf(!testDb)('protocol-builder across replicas', () => {
  const suite = setupProtocolBuilderSuite();
  const {
    teamRows,
    liveLeases,
    leaseExpiry,
    ageLeases,
    ageConnections,
    connectionRows,
    objects,
    objectStore,
    watch,
    watching,
  } = suite;

  const opened: { dispose: () => Promise<void> }[] = [];
  const channels: { stop: () => Promise<void> }[] = [];
  afterEach(async () => {
    for (const channel of channels.splice(0)) await channel.stop();
    for (const harness of opened.splice(0)) await harness.dispose();
  });

  const replicasOf = async (
    count: number,
    options: Omit<
      Parameters<typeof createProtocolBuilderReplicas>[1],
      'count' | 'objectStore' | 'database'
    > = {},
  ) => {
    const harness = await createProtocolBuilderReplicas(suite.studio, {
      ...options,
      count,
      objectStore,
      database: () => suite.ownPool(REPLICA_CONNECTIONS),
    });
    opened.push(harness);
    const [a, b, c] = harness.replicas;
    if (a === undefined || b === undefined) throw new Error('too few replicas');
    return { harness, a, b, c };
  };

  const watchingOn = async (
    who: Caller,
    over: Parameters<typeof watching>[2],
  ) => {
    const channel = await watching(who, suite.protocolId, over);
    channels.push(channel);
    return channel;
  };

  const newSection = async (label: string) =>
    (await suite.createStage(ADA, label)).sectionId;

  /** Lock events with no holder that the log holds for the section. */
  const releasesLogged = async (sectionId: string) => {
    const [row] = await teamRows<{ releases: number }>(
      `SELECT count(*)::int AS releases FROM protocol_events
        WHERE draft_id = $1 AND section_id = $2
          AND kind = 'lock' AND owner IS NULL`,
      [suite.draftId, sectionId],
    );
    return row?.releases ?? 0;
  };

  const lastCursor = async () => {
    const [row] = await teamRows<{ last: string }>(
      `SELECT max(cursor)::text AS last FROM protocol_events
        WHERE draft_id = $1`,
      [suite.draftId],
    );
    if (row === undefined) throw new Error('the draft has no log');
    return BigInt(row.last);
  };

  const liveSocketsOf = async (socket: string) =>
    (await connectionRows()).filter(
      (row) => row.kind === 'socket' && row.socket_id === socket && row.live,
    );

  const pollsLater = async (
    replica: { readonly spans: { ended: (name: string) => number } },
    polls = 2,
  ) => {
    const from = replica.spans.ended(RELAY_POLL);
    await until(
      () => replica.spans.ended(RELAY_POLL) >= from + polls,
      'the relay to poll again',
    );
  };

  it('keeps a lock whose tab reconnects to another replica within the grace', async () => {
    const shift = makeShiftableClock();
    const { a, b } = await replicasOf(2, {
      clock: shift.clock,
      safetyPollMs: NO_POLL_MS,
    });
    const sectionId = await newSection('Kept across replicas');
    const { caller, owner } = tabOf(ADA, 'moved');
    const onA = await watching(caller, suite.protocolId, a);
    const held = await a.call(
      caller,
      a.rpc('AcquireLock', { protocolId: suite.protocolId, sectionId }),
    );
    if (held.lock !== 'held') throw new Error('the section was taken');

    const graces = shift.pending(RECONNECT_GRACE_MS);
    await onA.stop();
    await until(
      () => shift.pending(RECONNECT_GRACE_MS) > graces,
      'A’s reconnect grace to start',
    );

    await ageLeases(owner, 5_000);
    const aged = await leaseExpiry(owner);
    if (aged === undefined) throw new Error('the tab holds no lease');
    await watchingOn(caller, b);
    expect(await leaseExpiry(owner)).toBeGreaterThan(aged + 10_000);

    shift.advance(RECONNECT_GRACE_MS);
    await until(
      () => a.spans.ended('protocolBuilder.releaseOwner') === 1,
      'A’s grace to ask for the release',
    );
    // The grace ended without giving anything back, and without waiting again.
    expect(await liveLeases(owner)).toEqual([sectionId]);
    expect(await releasesLogged(sectionId)).toBe(0);
    expect(shift.pending(RECONNECT_GRACE_MS)).toBe(graces);
    await until(
      () => a.spans.ended('protocolBuilder.graceElapsed') === 1,
      'A’s grace to end',
    );

    // B's keeper, not A's, renews it from here.
    await ageLeases(owner, 2_000);
    const lapsing = await leaseExpiry(owner);
    if (lapsing === undefined) throw new Error('the tab holds no lease');
    await until(
      () => shift.pending(RENEW_INTERVAL_MS) === 2,
      'both keepers to be waiting',
    );
    const passesOnA = a.spans.ended('protocolBuilder.liveness');
    const passesOnB = b.spans.ended('protocolBuilder.liveness');
    shift.advance(RENEW_INTERVAL_MS);
    await until(
      () => b.spans.ended('protocolBuilder.liveness') > passesOnB,
      'B’s keeper to renew',
    );
    expect(await leaseExpiry(owner)).toBeGreaterThan(lapsing + 10_000);
    expect(a.spans.ended('protocolBuilder.liveness')).toBe(passesOnA);
    expect(a.spans.ended('protocolBuilder.releaseOwner')).toBe(1);

    const written = await b.call(
      caller,
      b.rpc('Submit', {
        protocolId: suite.protocolId,
        requestId: randomUUID(),
        sectionId,
        document: { ...held.document, label: 'Saved on another replica' },
        revision: held.revision,
      }),
    );
    expect(written.revision.sequence).toBeGreaterThan(held.revision.sequence);
    expect(await releasesLogged(sectionId)).toBe(0);
  });

  it('releases a lock whose tab does not come back, and tells a watcher on another replica once', async () => {
    const shift = makeShiftableClock();
    const { a, b } = await replicasOf(2, {
      clock: shift.clock,
      safetyPollMs: NO_POLL_MS,
    });
    const sectionId = await newSection('Released across replicas');
    const { caller, owner } = tabOf(ADA, 'gone');
    const onB = await watchingOn(tabOf(GRACE, 'hears-release').caller, b);
    const onA = await watching(caller, suite.protocolId, a);
    const held = await a.call(
      caller,
      a.rpc('AcquireLock', { protocolId: suite.protocolId, sectionId }),
    );
    if (held.lock !== 'held') throw new Error('the section was taken');
    await until(
      () => takenIn(onB.events, sectionId).length > 0,
      'B’s watcher to hear the lock taken',
    );

    const graces = shift.pending(RECONNECT_GRACE_MS);
    await onA.stop();
    await until(
      () => shift.pending(RECONNECT_GRACE_MS) > graces,
      'A’s reconnect grace to start',
    );
    shift.advance(RECONNECT_GRACE_MS);
    await until(
      () => releasesIn(onB.events, sectionId).length > 0,
      'B’s watcher to hear the release',
    );
    expect(await liveLeases(owner)).toEqual([]);

    // B's safety poll reads the log again, and adds nothing to it.
    const polls = b.spans.ended(RELAY_POLL);
    shift.advance(NO_POLL_MS);
    await until(() => b.spans.ended(RELAY_POLL) > polls, 'B’s safety poll');
    expect(releasesIn(onB.events, sectionId)).toHaveLength(1);
    expect(await releasesLogged(sectionId)).toBe(1);
    expectContiguous(onB.events);
  });

  it('keeps a lock across an orderly restart of the replica its tab was on', async () => {
    const shift = makeShiftableClock();
    const { harness, a, b } = await replicasOf(2, {
      clock: shift.clock,
      safetyPollMs: FAST_POLL_MS,
    });
    const sectionId = await newSection('Kept across a restart');
    const { caller, owner, socket } = tabOf(ADA, 'restarted');
    const onB = await watchingOn(tabOf(GRACE, 'sees-restart').caller, b);
    const onA = watch(caller, suite.protocolId, a);
    await until(
      () => onA.events.some((event) => event.type === 'presence'),
      'the tab’s watch on A',
    );
    const held = await a.call(
      caller,
      a.rpc('AcquireLock', { protocolId: suite.protocolId, sectionId }),
    );
    if (held.lock !== 'held') throw new Error('the section was taken');

    await a.dispose();
    await onA.ended;
    // An orderly stop closes the socket row and interrupts the grace it began.
    expect(await liveSocketsOf(socket)).toEqual([]);
    expect(shift.pending(RECONNECT_GRACE_MS)).toBe(0);
    expect(await liveLeases(owner)).toEqual([sectionId]);

    const restarted = await harness.restart(0);
    expect(restarted.replicaId).not.toBe(a.replicaId);
    await ageLeases(owner, 5_000);
    const aged = await leaseExpiry(owner);
    if (aged === undefined) throw new Error('the tab holds no lease');
    await watchingOn(caller, restarted);
    expect(await leaseExpiry(owner)).toBeGreaterThan(aged + 10_000);

    shift.advance(RECONNECT_GRACE_MS);
    await pollsLater(b);
    expect(await liveLeases(owner)).toEqual([sectionId]);
    expect(await releasesLogged(sectionId)).toBe(0);
    expect(releasesIn(onB.events, sectionId)).toEqual([]);

    const written = await restarted.call(
      caller,
      restarted.rpc('Submit', {
        protocolId: suite.protocolId,
        requestId: randomUUID(),
        sectionId,
        document: { ...held.document, label: 'Saved after the restart' },
        revision: held.revision,
      }),
    );
    expect(written.revision.sequence).toBeGreaterThan(held.revision.sequence);
  });

  it('brings every watcher on every replica the whole log in order while B’s doorbell loses and reorders rings', async () => {
    const random = mulberry32(0x5eed);
    const lost = { tally: { dropped: 0, passed: 0 } };
    const { harness, a, b } = await replicasOf(3, {
      safetyPollMs: 250,
      doorbell: (index, hub) => {
        if (index !== 1) return hub;
        const view = lossy(hub, random);
        lost.tally = view.tally;
        return view.doorbell;
      },
    });
    const watchers = await Promise.all(
      harness.replicas.map((replica, index) =>
        watchingOn(tabOf(GRACE, `log-${index}`).caller, replica),
      ),
    );

    for (let round = 0; round < 8; round += 1) {
      await Promise.all(
        [a, b].map((writer, index) =>
          suite.createOn(writer, `Written on ${index} in round ${round}`),
        ),
      );
    }
    // Last on A, so no write of B's own wakes its relay for the end of the log.
    for (let tail = 0; tail < 2; tail += 1) {
      await suite.createOn(a, `Written last on A, ${tail}`);
    }
    const last = await lastCursor();
    await until(
      () =>
        watchers.every((channel) => cursorsOf(channel.events).at(-1) === last),
      'every watcher to reach the end of the log',
      10_000,
    );

    expect(lost.tally.dropped).toBeGreaterThan(0);
    expect(lost.tally.passed).toBeGreaterThan(0);
    for (const channel of watchers) {
      const cursors = cursorsOf(channel.events);
      expect(new Set(cursors).size).toBe(cursors.length);
      expectContiguous(channel.events);
      expect(cursors.at(-1)).toBe(last);
    }
  });

  it('drops a crashed replica’s watcher from presence once its connection lapses', async () => {
    const { harness, a, b } = await replicasOf(2, {
      safetyPollMs: FAST_POLL_MS,
    });
    const onA = tabOf(ADA, 'present-a');
    const onB = tabOf(GRACE, 'present-b');
    const watcherOnA = await watchingOn(onA.caller, a);
    await watchingOn(onB.caller, b);
    await until(
      () =>
        presentIn(watcherOnA.events).includes(onA.socket) &&
        presentIn(watcherOnA.events).includes(onB.socket),
      'A to list both watchers',
    );

    await harness.crash(1);
    // Nothing closed the crashed replica's socket row.
    expect(await liveSocketsOf(onB.socket)).toEqual([
      expect.objectContaining({ replica_id: b.replicaId }),
    ]);
    await pollsLater(a);
    expect(presentIn(watcherOnA.events)).toContain(onB.socket);

    await ageConnections({ socketId: onB.socket }, -1_000);
    await pollsLater(a);
    expect(presentIn(watcherOnA.events)).not.toContain(onB.socket);
    expect(presentIn(watcherOnA.events)).toContain(onA.socket);
  });

  it('logs one release between the replicas left for a lease a crashed replica held', async () => {
    // One clock and no poll of their own, so B and C reap in the same instant.
    const shift = makeShiftableClock();
    const { harness, a, b, c } = await replicasOf(3, {
      clock: shift.clock,
      safetyPollMs: NO_POLL_MS,
    });
    if (c === undefined) throw new Error('too few replicas');
    const pollTogether = async () => {
      const from = left.map(({ replica }) => replica.spans.ended(RELAY_POLL));
      shift.advance(NO_POLL_MS);
      await until(
        () =>
          left.every(
            ({ replica }, index) =>
              replica.spans.ended(RELAY_POLL) > (from[index] ?? 0),
          ),
        'B and C to poll',
      );
    };
    const sectionId = await newSection('Held by a crashed replica');
    const { caller, owner, socket } = tabOf(ADA, 'crashed');
    const left = [
      {
        replica: b,
        channel: await watchingOn(tabOf(GRACE, 'reap-b').caller, b),
      },
      {
        replica: c,
        channel: await watchingOn(tabOf(GRACE, 'reap-c').caller, c),
      },
    ];
    const onA = watch(caller, suite.protocolId, a);
    await until(
      () => onA.events.some((event) => event.type === 'presence'),
      'the tab’s watch on A',
    );
    const held = await a.call(
      caller,
      a.rpc('AcquireLock', { protocolId: suite.protocolId, sectionId }),
    );
    if (held.lock !== 'held') throw new Error('the section was taken');
    await until(
      () =>
        left.every(
          ({ channel }) => takenIn(channel.events, sectionId).length > 0,
        ),
      'B and C to hear the lock taken',
    );

    await harness.crash(0);
    await onA.ended;
    expect(await liveLeases(owner)).toEqual([sectionId]);
    expect(await liveSocketsOf(socket)).toHaveLength(1);

    await ageLeases(owner, -1_000);
    // Holding the head, so each replica's poll reads the lapsed lease before
    // either reap can log its release, and both reaps are in flight at once.
    const head = await suite.holdRow(
      'SELECT 1 FROM drafts WHERE id = $1 FOR UPDATE',
      [suite.draftId],
    );
    try {
      await pollTogether();
      await until(
        async () => (await suite.waitingOn(head.pid)) >= 2,
        'B and C both to wait to reap',
      );
    } finally {
      await head.release();
    }
    await until(
      () =>
        left.every(
          ({ channel }) => releasesIn(channel.events, sectionId).length > 0,
        ),
      'B and C to hear the release',
    );
    await until(
      () =>
        left.every(
          ({ replica }) => replica.spans.ended('protocolBuilder.reap') > 0,
        ),
      'B and C both to have reaped',
    );
    await pollTogether();
    expect(await releasesLogged(sectionId)).toBe(1);
    for (const { channel } of left) {
      expect(releasesIn(channel.events, sectionId)).toHaveLength(1);
      expectContiguous(channel.events);
    }
  });

  it('logs no release for a crashed replica’s lease once its tab has reconnected elsewhere', async () => {
    const shift = makeShiftableClock();
    const { harness, a, b } = await replicasOf(2, {
      clock: shift.clock,
      safetyPollMs: FAST_POLL_MS,
    });
    const sectionId = await newSection('Moved off a crashed replica');
    const { caller, owner } = tabOf(ADA, 'survivor');
    const onlooker = await watchingOn(tabOf(GRACE, 'no-reap').caller, b);
    const onA = watch(caller, suite.protocolId, a);
    await until(
      () => onA.events.some((event) => event.type === 'presence'),
      'the tab’s watch on A',
    );
    const held = await a.call(
      caller,
      a.rpc('AcquireLock', { protocolId: suite.protocolId, sectionId }),
    );
    if (held.lock !== 'held') throw new Error('the section was taken');
    await until(
      () => takenIn(onlooker.events, sectionId).length > 0,
      'B’s watcher to hear the lock taken',
    );

    await harness.crash(0);
    await onA.ended;
    await watchingOn(caller, b);

    // Lapsing soon unless B's keeper renews it.
    await ageLeases(owner, 1_500);
    const lapsing = await leaseExpiry(owner);
    if (lapsing === undefined) throw new Error('the tab holds no lease');
    await until(
      () => shift.pending(RENEW_INTERVAL_MS) === 1,
      'B’s keeper to be waiting',
    );
    const passes = b.spans.ended('protocolBuilder.liveness');
    shift.advance(RENEW_INTERVAL_MS);
    await until(
      () => b.spans.ended('protocolBuilder.liveness') > passes,
      'B’s keeper to renew',
    );
    expect(await leaseExpiry(owner)).toBeGreaterThan(lapsing + 10_000);

    await until(() => Date.now() > lapsing + 500, 'the aged expiry to pass');
    await pollsLater(b);
    expect(await liveLeases(owner)).toEqual([sectionId]);
    expect(await releasesLogged(sectionId)).toBe(0);
    expect(releasesIn(onlooker.events, sectionId)).toEqual([]);
    expect(b.spans.ended('protocolBuilder.reap')).toBe(0);
  });

  it('grants a section to exactly one of two tabs asking at once on different replicas', async () => {
    const { a, b } = await replicasOf(2);
    const sectionId = await newSection('Contended across replicas');
    const contenders = [
      { replica: a, ...tabOf(ADA, 'race') },
      { replica: b, ...tabOf(GRACE, 'race') },
    ];
    const liveOwners = async () =>
      (
        await teamRows<{ owner: string }>(
          `SELECT owner FROM leases
            WHERE draft_id = $1 AND section_id = $2
              AND expires_at > clock_timestamp()`,
          [suite.draftId, sectionId],
        )
      ).map((row) => row.owner);

    for (let round = 0; round < 6; round += 1) {
      const answers = await Promise.all(
        contenders.map(({ replica, caller }) =>
          replica.call(
            caller,
            replica.rpc('AcquireLock', {
              protocolId: suite.protocolId,
              sectionId,
            }),
          ),
        ),
      );
      expect(answers.map((answer) => answer.lock).toSorted()).toEqual([
        'held',
        'readOnly',
      ]);
      const winner = contenders.find(
        (_, index) => answers[index]?.lock === 'held',
      );
      if (winner === undefined) throw new Error('no tab holds the section');
      expect(await liveOwners()).toEqual([winner.owner]);
      await winner.replica.call(
        winner.caller,
        winner.replica.rpc('ReleaseLock', {
          protocolId: suite.protocolId,
          sectionId,
        }),
      );
      expect(await liveOwners()).toEqual([]);
    }
  });

  it('promotes on one replica a file staged on another, and clears the staging behind it', async () => {
    const { a, b } = await replicasOf(2);
    const { caller } = tabOf(ADA, 'promoting');
    const editId = `edit-across-replicas-${randomUUID()}`;
    const bytes = new Uint8Array(randomBytes(32));
    const staged = await a.call(
      caller,
      a.rpc('ResourcesStage', {
        protocolId: suite.protocolId,
        editId,
        requestId: randomUUID(),
        request: {
          kind: 'content',
          contentKind: 'image',
          name: 'A photograph',
          source: 'photo.png',
          contentType: 'image/png',
          bytes,
        },
      }),
    );
    if (staged.status !== 'ok') throw new Error(staged.failure.message);
    const resourceId = staged.data.descriptor.id;
    const stagedRows = () =>
      teamRows<{ objectKey: string }>(
        `SELECT object_key AS "objectKey" FROM protocol_staged_resources
          WHERE resource_id = $1`,
        [resourceId],
      );
    const [row] = await stagedRows();
    if (row === undefined) throw new Error('no staged row');
    expect(objects.keys()).toContain(row.objectKey);

    const sectionId = await newSection('Promoted on another replica');
    const held = await b.call(
      caller,
      b.rpc('AcquireLock', { protocolId: suite.protocolId, sectionId }),
    );
    if (held.lock !== 'held') throw new Error('the section was taken');
    const written = await b.call(
      caller,
      b.rpc('Submit', {
        protocolId: suite.protocolId,
        requestId: randomUUID(),
        sectionId,
        document: held.document,
        revision: held.revision,
        promote: { editId, resourceIds: [resourceId] },
      }),
    );
    const digest = createHash('sha256').update(bytes).digest('hex');
    expect(written.promoted).toEqual([
      expect.objectContaining({
        id: resourceId,
        status: 'committed',
        source: `${digest}.png`,
      }),
    ]);
    expect(objects.keys()).toContain(`assets/${digest}`);
    expect(await stagedRows()).toEqual([]);
    await until(
      () => objects.removed().includes(row.objectKey),
      'the staged object to be removed',
    );
    expect(objects.keys()).not.toContain(row.objectKey);
  });
});
