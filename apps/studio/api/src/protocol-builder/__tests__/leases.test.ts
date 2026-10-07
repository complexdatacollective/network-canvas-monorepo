import { Effect, Exit, Layer, Logger, type LogLevel, Option } from 'effect';
import { beforeAll, describe, expect, it } from 'vitest';

import type { ProtocolSectionId } from '@codaco/studio-sync/taxonomy';

import { ownerAffected, testDb } from '../../__tests__/support/database.ts';
import { memoryObjectStore } from '../../__tests__/support/object-store.ts';
import {
  ADA,
  callerOf,
  GRACE,
  holdingEvents,
  latch,
  setupProtocolBuilderSuite,
  until,
} from '../../__tests__/support/protocol-builder-suite.ts';
import {
  type Caller,
  createProtocolBuilderClient,
  makeShiftableClock,
  makeSpanCounter,
  type ProtocolBuilderTestClient,
} from '../../__tests__/support/protocol-builder.ts';
import type { Studio } from '../../app.ts';
import {
  type Closure,
  MaintenanceTriggers,
} from '../../http/middleware/maintenance.ts';
import { ObjectStore } from '../../storage/object-store.ts';
import { LIVENESS_LOCK_TIMEOUT_MS } from '../connections.ts';
import type { LoggedProtocolEvent } from '../events.ts';
import {
  CONNECT_TIMEOUT_MS,
  GRACE_RELEASE_TIMEOUT_MS,
  Leases,
  RECONNECT_GRACE_MS,
  RENEW_INTERVAL_MS,
} from '../leases.ts';
import { IDLE_MS } from '../schema.ts';

/** Long enough that a unary call reaches the database again. */
const PAST_CONTACT_INTERVAL_MS = 60_000;

describe.skipIf(!testDb)('the lease keeper', () => {
  const suite = setupProtocolBuilderSuite();
  const {
    objectStore,
    teamRows,
    connectionRows,
    liveLeases,
    leaseExpiry,
    ageLeases,
    ageConnections,
    keeperTick,
    watch,
    watching,
    createOn,
    holdRow,
    blockedBehind,
  } = suite;
  let protocolId: string;
  let draftId: string;
  let studio: Studio;

  beforeAll(() => {
    protocolId = suite.protocolId;
    draftId = suite.draftId;
    studio = suite.studio;
  });

  /** A tab no other test uses, so no other client's keeper renews it. */
  const tabOf = (slug: string) => {
    const tab = `pb-ada-${slug}-tab`;
    return {
      owner: `${ADA.principal.userId}:${tab}`,
      on: (connection?: string): Caller => ({
        principal: ADA.principal,
        tab,
        ...(connection === undefined ? {} : { connection }),
      }),
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

  const replica = async (
    options: {
      readonly maintenance?: MaintenanceTriggers['Service'];
      readonly replicaId?: string;
      readonly studio?: Studio;
      readonly objectStore?: ObjectStore['Service'];
      readonly events?: ReturnType<typeof holdingEvents>['layer'];
    } = {},
  ) => {
    const time = makeShiftableClock();
    const spans = makeSpanCounter();
    const { studio: own, ...rest } = options;
    const client = await createProtocolBuilderClient(own ?? studio, {
      clock: time.clock,
      objectStore,
      tracer: spans.tracer,
      ...rest,
    });
    return { client, time, spans };
  };

  /** Lets whatever a test just woke run, when there is nothing to wait for. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

  const liveSockets = async (owner: string) =>
    (await connectionRows()).filter(
      (row) => row.owner === owner && row.kind === 'socket' && row.live,
    );

  const releasesOf = async (sectionId: string) => {
    const [row] = await teamRows<{ releases: number }>(
      `SELECT count(*)::int AS releases FROM protocol_events
        WHERE draft_id = $1 AND section_id = $2
          AND kind = 'lock' AND owner IS NULL`,
      [draftId, sectionId],
    );
    return row?.releases ?? 0;
  };

  it('keeps a tab’s leases while another watch on the same socket stays open', async () => {
    const a = await replica();
    const { owner, on } = tabOf('twin');
    const caller = on('pb-ada-twin-connection');
    try {
      const stage = await createOn(a.client, 'Watched twice over one socket');
      const sectionId = stage.sectionId;
      const first = await watching(caller, protocolId, a.client);
      const second = await watching(caller, protocolId, a.client);
      try {
        await a.client.call(
          caller,
          a.client.rpc('AcquireLock', { protocolId, sectionId }),
        );
        expect(await liveSockets(owner)).toHaveLength(2);

        await first.stop();
        await until(
          async () => (await liveSockets(owner)).length === 1,
          'the ended watch’s row to expire',
        );
        await until(
          () => a.spans.ended('protocolBuilder.disconnect') > 0,
          'the ended watch’s close to finish',
        );
        // The tab's other socket is open here, so no grace began.
        expect(a.time.pending(RECONNECT_GRACE_MS)).toBe(0);
        a.time.advance(RECONNECT_GRACE_MS + 1);
        await keeperTick(RENEW_INTERVAL_MS, a.time);

        expect(await liveLeases(owner)).toEqual([sectionId]);
        expect(await releasesOf(sectionId)).toBe(0);
        await a.client.call(
          caller,
          a.client.rpc('ReleaseLock', { protocolId, sectionId }),
        );
      } finally {
        await second.stop();
      }
    } finally {
      await a.client.dispose();
    }
  });

  it('leaves the grace to the replica still holding the tab’s socket, which gives the leases back a whole grace after that socket closes', async () => {
    const a = await replica();
    const b = await replica();
    const { owner, on } = tabOf('roaming');
    const onA = on('pb-ada-roaming-a-connection');
    const onB = on('pb-ada-roaming-b-connection');
    try {
      const stage = await createOn(a.client, 'Held across two replicas');
      const sectionId = stage.sectionId;
      const watchedOnA = await watching(onA, protocolId, a.client);
      const watchedOnB = await watching(onB, protocolId, b.client);
      let stoppedOnB = false;
      try {
        await a.client.call(
          onA,
          a.client.rpc('AcquireLock', { protocolId, sectionId }),
        );
        await watchedOnA.stop();
        await until(
          () => a.time.pending(RECONNECT_GRACE_MS) > 0,
          'replica A’s grace to start',
        );

        a.time.advance(RECONNECT_GRACE_MS);
        await until(
          () => a.spans.ended('protocolBuilder.graceElapsed') > 0,
          'replica A’s grace to end',
        );
        expect(a.spans.ended('protocolBuilder.releaseOwner')).toBe(1);
        expect(await releasesOf(sectionId)).toBe(0);
        expect(await liveLeases(owner)).toEqual([sectionId]);

        // Well past every TTL: a grace that waited again would try again.
        a.time.advance(10 * RECONNECT_GRACE_MS);
        await settle();
        expect(a.spans.count('protocolBuilder.releaseOwner')).toBe(1);

        stoppedOnB = true;
        await watchedOnB.stop();
        await until(
          () => b.time.pending(RECONNECT_GRACE_MS) > 0,
          'replica B’s grace to start',
        );
        b.time.advance(RECONNECT_GRACE_MS - 1_000);
        await settle();
        expect(b.spans.count('protocolBuilder.releaseOwner')).toBe(0);
        expect(await liveLeases(owner)).toEqual([sectionId]);

        b.time.advance(1_000);
        await until(
          () => b.spans.ended('protocolBuilder.releaseOwner') > 0,
          'replica B’s release',
        );
        expect(await releasesOf(sectionId)).toBe(1);
        expect(await liveLeases(owner)).toEqual([]);
      } finally {
        if (!stoppedOnB) await watchedOnB.stop();
      }
    } finally {
      await b.client.dispose();
      await a.client.dispose();
    }
  });

  it('keeps the grace when the tab’s reconnect fails to be recorded', async () => {
    const a = await replica();
    const { owner, on } = tabOf('refused');
    const first = on('pb-ada-refused-connection');
    const refused = 'pb-ada-refused-again-connection';
    const asOwner = (statement: string) =>
      suite.database.run(ownerAffected(statement));
    try {
      const stage = await createOn(a.client, 'Held through a failed reconnect');
      const sectionId = stage.sectionId;
      const channel = await watching(first, protocolId, a.client);
      await a.client.call(
        first,
        a.client.rpc('AcquireLock', { protocolId, sectionId }),
      );
      await channel.stop();
      await until(
        () => a.time.pending(RECONNECT_GRACE_MS) > 0,
        'the reconnect grace to start',
      );

      await asOwner(
        `CREATE FUNCTION pb_refuse_socket() RETURNS trigger LANGUAGE plpgsql
           AS $$ BEGIN RAISE EXCEPTION 'refused for the test'; END $$`,
      );
      await asOwner(
        `CREATE TRIGGER pb_refuse_socket BEFORE INSERT ON protocol_connections
           FOR EACH ROW WHEN (NEW.socket_id = '${refused}')
           EXECUTE FUNCTION pb_refuse_socket()`,
      );
      try {
        const retried = watch(on(refused), protocolId, a.client);
        expect((await retried.ended)._tag).toBe('Failure');
      } finally {
        await asOwner('DROP TRIGGER pb_refuse_socket ON protocol_connections');
        await asOwner('DROP FUNCTION pb_refuse_socket()');
      }
      expect(a.time.pending(RECONNECT_GRACE_MS)).toBe(1);
      expect(await liveLeases(owner)).toEqual([sectionId]);

      a.time.advance(RECONNECT_GRACE_MS);
      await until(
        async () => (await liveLeases(owner)).length === 0,
        'the grace to give the lease back',
      );
    } finally {
      await a.client.dispose();
    }
  });

  it('leaves no live row behind when a watch closes while its row is being recorded again', async () => {
    // A pool of its own: on the suite's single connection the close would
    // queue behind the blocked re-record in the pool, not in the replica.
    const own = await suite.studioOnOwnPool(4);
    const a = await replica({ studio: own.studio });
    const { owner, on } = tabOf('ghost');
    try {
      const channel = await watching(
        on('pb-ada-ghost-connection'),
        protocolId,
        a.client,
      );
      const [row] = await liveSockets(owner);
      if (row === undefined) throw new Error('the watch recorded no row');
      const key = row.connection_id;
      await ageConnections({ owner, kind: 'socket' }, -1_000);
      const held = await holdRow(
        `SELECT 1 FROM protocol_connections
          WHERE draft_id = $1 AND connection_id = $2 FOR UPDATE`,
        [draftId, key],
      );
      let stopping: Promise<void> | undefined;
      let expired = 0;
      try {
        await until(
          () => a.time.pending(RENEW_INTERVAL_MS) > 0,
          'the lease keeper to be waiting',
        );
        a.time.advance(RENEW_INTERVAL_MS);
        await until(
          async () => (await blockedBehind(held.pid)).length > 0,
          'the row to be recorded again',
        );

        const begun = a.spans.count('protocolBuilder.expireConnection');
        expired = a.spans.ended('protocolBuilder.expireConnection');
        stopping = channel.stop();
        await until(
          () => a.spans.count('protocolBuilder.disconnect') > 0,
          'the close to reach the replica',
        );
        await settle();
        // Run one at a time, the close waits for the re-record in the
        // replica, and has not begun to expire the row in the database.
        expect(a.spans.count('protocolBuilder.expireConnection')).toBe(begun);
      } finally {
        await held.release();
      }
      await stopping;
      // The watch ends on the client before its close has finished here.
      await until(
        () => a.spans.ended('protocolBuilder.expireConnection') > expired,
        'the close to expire the row',
      );
      await until(
        () => a.time.pending(RENEW_INTERVAL_MS) > 0,
        'the lease keeper to finish its tick',
      );
      expect(
        (await connectionRows()).filter(
          (candidate) => candidate.connection_id === key && candidate.live,
        ),
      ).toEqual([]);
    } finally {
      await a.client.dispose();
      await own.close();
    }
  });

  it('takes the draft head before any connection or lease row', async () => {
    const a = await replica();
    const { on } = tabOf('ordered');
    const waitsOnTheHead = async (
      span: string,
      start: () => Promise<unknown>,
    ) => {
      const held = await holdRow(
        'SELECT 1 FROM drafts WHERE id = $1 FOR UPDATE',
        [draftId],
      );
      const begun = a.spans.count(span);
      const ended = a.spans.ended(span);
      let started: Promise<unknown> | undefined;
      try {
        started = start();
        await until(
          async () =>
            a.spans.count(span) > begun &&
            (await blockedBehind(held.pid)).length > 0,
          `${span} to wait on the draft head`,
        );
        expect(a.spans.ended(span)).toBe(ended);
        for (const waiter of await blockedBehind(held.pid)) {
          expect(waiter.holds).toEqual([]);
        }
      } finally {
        await held.release();
      }
      await started;
      expect(a.spans.ended(span)).toBeGreaterThan(ended);
    };
    try {
      const channel = await watching(
        on('pb-ada-ordered-connection'),
        protocolId,
        a.client,
      );
      try {
        await waitsOnTheHead('protocolBuilder.liveness', async () => {
          await until(
            () => a.time.pending(RENEW_INTERVAL_MS) > 0,
            'the lease keeper to be waiting',
          );
          a.time.advance(RENEW_INTERVAL_MS);
          await until(
            () => a.time.pending(RENEW_INTERVAL_MS) > 0,
            'the lease keeper to finish its tick',
          );
        });
        // A tab not yet seen here, so its first call reaches the database.
        await waitsOnTheHead('protocolBuilder.contact', () =>
          a.client.call(
            tabOf('ordered-calls').on(),
            a.client.rpc('ResourcesList', {
              protocolId,
              editId: 'pb-ordered-edit',
              status: 'staged',
            }),
          ),
        );
        let second: Awaited<ReturnType<typeof watching>> | undefined;
        try {
          await waitsOnTheHead('protocolBuilder.connect', async () => {
            second = await watching(
              on('pb-ada-ordered-second-connection'),
              protocolId,
              a.client,
            );
          });
        } finally {
          await second?.stop();
        }
      } finally {
        await channel.stop();
      }
    } finally {
      await a.client.dispose();
    }
  });

  it('renews other drafts while one waits on a lock, and retries that one at the next tick', async () => {
    const own = await suite.studioOnOwnPool(4);
    const a = await replica({ studio: own.studio });
    const { on } = tabOf('blocked');
    const waiting = on('pb-ada-blocked-connection');
    const free = on('pb-ada-free-connection');
    const socketExpiry = async (caller: Caller) => {
      const [row] = await teamRows<{ at: number | null }>(
        `SELECT (extract(epoch from max(expires_at)) * 1000)::float8 AS at
           FROM protocol_connections WHERE socket_id = $1`,
        [caller.connection],
      );
      return row?.at ?? 0;
    };
    const passes = () => a.spans.ended('protocolBuilder.liveness');
    try {
      // Watched first, so a keeper taking drafts one at a time reaches it first.
      const onWaiting = await watching(waiting, protocolId, a.client);
      const onFree = await watching(free, suite.egolessProtocolId, a.client);
      try {
        const waitingBefore = await socketExpiry(waiting);
        const freeBefore = await socketExpiry(free);
        const held = await holdRow(
          'SELECT 1 FROM drafts WHERE id = $1 FOR UPDATE',
          [draftId],
        );
        const ended = passes();
        try {
          await until(
            () => a.time.pending(RENEW_INTERVAL_MS) > 0,
            'the lease keeper to be waiting',
          );
          a.time.advance(RENEW_INTERVAL_MS);
          await until(() => passes() > ended, 'the free draft to be renewed');
          expect(await blockedBehind(held.pid)).toHaveLength(1);
          expect(await socketExpiry(free)).toBeGreaterThan(freeBefore);

          await until(
            () => passes() > ended + 1,
            'the waiting draft to give up its pass',
            2 * LIVENESS_LOCK_TIMEOUT_MS,
          );
          expect(await blockedBehind(held.pid)).toHaveLength(0);
          expect(await socketExpiry(waiting)).toBe(waitingBefore);
        } finally {
          await held.release();
        }
        await keeperTick(RENEW_INTERVAL_MS, a.time);
        expect(await socketExpiry(waiting)).toBeGreaterThan(waitingBefore);
      } finally {
        await onFree.stop();
        await onWaiting.stop();
      }
    } finally {
      await a.client.dispose();
      await own.close();
    }
  });

  it('renews the leases of every owner on a draft in one statement', async () => {
    const a = await replica();
    const tabs = [tabOf('renewed-first'), tabOf('renewed-second')];
    const channels: Array<Awaited<ReturnType<typeof watching>>> = [];
    const held: Array<{ caller: Caller; sectionId: ProtocolSectionId }> = [];
    try {
      for (const [index, tab] of tabs.entries()) {
        const caller = tab.on(`pb-ada-renewed-${index}-connection`);
        channels.push(await watching(caller, protocolId, a.client));
        const stage = await createOn(a.client, `Renewed with another ${index}`);
        const taken = await a.client.call(
          caller,
          a.client.rpc('AcquireLock', {
            protocolId,
            sectionId: stage.sectionId,
          }),
        );
        expect(taken.lock).toBe('held');
        held.push({ caller, sectionId: stage.sectionId });
      }
      const before = await Promise.all(
        tabs.map((tab) => leaseExpiry(tab.owner)),
      );
      const renewals = a.spans.count('sync.renewHeld');

      await keeperTick(RENEW_INTERVAL_MS, a.time);

      expect(a.spans.count('sync.renewHeld')).toBe(renewals + 1);
      for (const [index, tab] of tabs.entries()) {
        expect(await leaseExpiry(tab.owner)).toBeGreaterThan(
          before[index] ?? Number.POSITIVE_INFINITY,
        );
      }
    } finally {
      for (const { caller, sectionId } of held) {
        await a.client.call(
          caller,
          a.client.rpc('ReleaseLock', { protocolId, sectionId }),
        );
      }
      for (const channel of channels) await channel.stop();
      await a.client.dispose();
    }
  });

  it('records each replica’s contact under its own key, and renews only its own rows', async () => {
    const a = await replica({ replicaId: 'pb-replica-a' });
    const b = await replica({ replicaId: 'pb-replica-b' });
    const { owner, on } = tabOf('replicas');
    const list = (over: typeof a) =>
      over.client.call(
        on(),
        over.client.rpc('ResourcesList', {
          protocolId,
          editId: 'pb-replicas-edit',
          status: 'staged',
        }),
      );
    const contactRows = async () =>
      (
        await teamRows<{
          connection_id: string;
          replica_id: string;
          expires_at: Date;
        }>(
          `SELECT connection_id, replica_id, expires_at
             FROM protocol_connections
            WHERE draft_id = $1 AND owner = $2 AND kind = 'contact'
            ORDER BY replica_id`,
          [draftId, owner],
        )
      ).map((row) => ({
        key: row.connection_id,
        replicaId: row.replica_id,
        expiresAt: row.expires_at.getTime(),
      }));
    try {
      await list(a);
      await list(b);
      const [onA, onB] = await contactRows();
      if (onA === undefined || onB === undefined) {
        throw new Error('a replica recorded no contact');
      }
      expect([onA.key, onB.key]).toEqual([
        `unary:${owner}:pb-replica-a`,
        `unary:${owner}:pb-replica-b`,
      ]);
      expect([onA.replicaId, onB.replicaId]).toEqual([
        'pb-replica-a',
        'pb-replica-b',
      ]);

      await keeperTick(RENEW_INTERVAL_MS, a.time);
      const [renewedOnA, leftOnB] = await contactRows();
      expect(renewedOnA?.expiresAt).toBeGreaterThan(onA.expiresAt);
      expect(leftOnB?.expiresAt).toBe(onB.expiresAt);
    } finally {
      await b.client.dispose();
      await a.client.dispose();
    }
  });

  it('records a watch again when its row lapsed behind the keeper’s back', async () => {
    const a = await replica();
    const { owner, on } = tabOf('lapsed');
    const caller = on('pb-ada-lapsed-connection');
    try {
      const channel = await watching(caller, protocolId, a.client);
      try {
        expect(await liveSockets(owner)).toHaveLength(1);
        await ageConnections({ owner, kind: 'socket' }, -1_000);
        expect(await liveSockets(owner)).toHaveLength(0);

        await keeperTick(RENEW_INTERVAL_MS, a.time);
        expect(await liveSockets(owner)).toHaveLength(1);
      } finally {
        await channel.stop();
      }
    } finally {
      await a.client.dispose();
    }
  });

  it('gives up a grace’s release still waiting on the draft head at its bound', async () => {
    const a = await replica();
    const { owner, on } = tabOf('bounded-grace');
    const caller = on('pb-ada-bounded-grace-connection');
    try {
      const stage = await createOn(a.client, 'Held through a bounded grace');
      const sectionId = stage.sectionId;
      const channel = await watching(caller, protocolId, a.client);
      await a.client.call(
        caller,
        a.client.rpc('AcquireLock', { protocolId, sectionId }),
      );
      await channel.stop();
      await until(
        () => a.time.pending(RECONNECT_GRACE_MS) > 0,
        'the grace to start',
      );
      const head = await holdRow(
        'SELECT id FROM drafts WHERE id = $1 FOR UPDATE',
        [draftId],
      );
      try {
        a.time.advance(RECONNECT_GRACE_MS + 1);
        await until(
          () => a.spans.count('protocolBuilder.releaseOwner') > 0,
          'the release to begin',
        );
        await settle();
        a.time.advance(GRACE_RELEASE_TIMEOUT_MS);
        await until(
          () => a.spans.ended('protocolBuilder.graceElapsed') > 0,
          'the grace to give up while the head is held',
        );
      } finally {
        await head.release();
      }
      expect(await releasesOf(sectionId)).toBe(0);
      expect(await liveLeases(owner)).toEqual([sectionId]);
      await ageLeases(owner, -1_000);
    } finally {
      await a.client.dispose();
    }
  });

  it('fails a watch whose connect still waits on the draft head at its bound', async () => {
    const a = await replica();
    const { on } = tabOf('bounded-connect');
    const caller = on('pb-ada-bounded-connect-connection');
    try {
      // Recorded first, so the watch's own contact is not due and only its
      // connect reaches the head.
      await a.client.call(
        on(),
        a.client.rpc('ResourcesList', {
          protocolId,
          editId: 'pb-bounded-connect-edit',
          status: 'staged',
        }),
      );
      const head = await holdRow(
        'SELECT id FROM drafts WHERE id = $1 FOR UPDATE',
        [draftId],
      );
      const channel = watch(caller, protocolId, a.client);
      try {
        await until(
          () => a.spans.count('protocolBuilder.connect') > 0,
          'the connect to begin',
        );
        await settle();
        a.time.advance(CONNECT_TIMEOUT_MS);
        const ended = await Promise.race([
          channel.ended,
          new Promise<undefined>((resolve) =>
            setTimeout(() => resolve(undefined), 2_000),
          ),
        ]);
        if (ended === undefined) {
          throw new Error('the watch went on waiting past its bound');
        }
        expect(Exit.isFailure(ended)).toBe(true);
      } finally {
        await head.release();
        await channel.stop();
      }
    } finally {
      await a.client.dispose();
    }
  });

  it('writes the head and gives back a grace’s leases past a transaction that only references the draft', async () => {
    const a = await replica();
    const { owner, on } = tabOf('referenced-head');
    const caller = on('pb-ada-referenced-head-connection');
    try {
      const stage = await createOn(a.client, 'Held past a reference');
      const sectionId = stage.sectionId;
      const channel = await watching(caller, protocolId, a.client);
      await a.client.call(
        caller,
        a.client.rpc('AcquireLock', { protocolId, sectionId }),
      );
      await channel.stop();
      await until(
        () => a.time.pending(RECONNECT_GRACE_MS) > 0,
        'the grace to start',
      );
      // The lock a staged upload's insert takes on the draft it references.
      const reference = await holdRow(
        'SELECT id FROM drafts WHERE id = $1 FOR KEY SHARE',
        [draftId],
      );
      try {
        const created = await Promise.race([
          createOn(a.client, 'Written past a reference'),
          new Promise<undefined>((resolve) =>
            setTimeout(() => resolve(undefined), 3_000),
          ),
        ]);
        if (created === undefined) {
          throw new Error('the host write waited on a reference to the draft');
        }
        a.time.advance(RECONNECT_GRACE_MS + 1);
        await until(
          () => a.spans.ended('protocolBuilder.graceElapsed') > 0,
          'the grace to give its leases back past a reference to the draft',
        );
      } finally {
        await reference.release();
      }
      expect(await releasesOf(sectionId)).toBe(1);
      expect(await liveLeases(owner)).toEqual([]);
    } finally {
      await a.client.dispose();
    }
  });

  it('keeps ticking after a tick that died', async () => {
    let faulting = false;
    const a = await replica({
      maintenance: MaintenanceTriggers.of({
        closure: Effect.suspend(() =>
          faulting
            ? Effect.die(new Error('a fault inside the keeper'))
            : Effect.succeed(Option.none<Closure>()),
        ),
      }),
    });
    const { owner, on } = tabOf('faulted');
    try {
      const channel = await watching(
        on('pb-ada-faulted-connection'),
        protocolId,
        a.client,
      );
      try {
        faulting = true;
        await keeperTick(RENEW_INTERVAL_MS, a.time);
        faulting = false;

        await ageConnections({ owner, kind: 'socket' }, -1_000);
        await keeperTick(RENEW_INTERVAL_MS, a.time);
        expect(await liveSockets(owner)).toHaveLength(1);
      } finally {
        await channel.stop();
      }
    } finally {
      await a.client.dispose();
    }
  });

  it('keeps a calling tab’s lease renewed until it has been idle a while since its latest call', async () => {
    const a = await replica();
    const { owner, on } = tabOf('calling');
    const caller = on();
    const renewedBy = async (millis: number) => {
      const before = await leaseExpiry(owner);
      await keeperTick(millis, a.time);
      const after = await leaseExpiry(owner);
      if (before === undefined || after === undefined) {
        throw new Error('the tab holds no lease');
      }
      return after > before;
    };
    try {
      const stage = await createOn(a.client, 'Held by calls alone');
      const sectionId = stage.sectionId;
      const held = await a.client.call(
        caller,
        a.client.rpc('AcquireLock', { protocolId, sectionId }),
      );
      expect(held.lock).toBe('held');

      expect(await renewedBy(RENEW_INTERVAL_MS)).toBe(true);
      // One tick short of the idle bound: still renewed.
      expect(await renewedBy(IDLE_MS - 2 * RENEW_INTERVAL_MS)).toBe(true);

      // A later call starts the bound again from here.
      await a.client.call(
        caller,
        a.client.rpc('ResourcesList', {
          protocolId,
          editId: 'pb-calling-edit',
          status: 'staged',
        }),
      );
      expect(await renewedBy(2 * RENEW_INTERVAL_MS)).toBe(true);
      expect(await renewedBy(IDLE_MS - 3 * RENEW_INTERVAL_MS)).toBe(true);

      expect(await renewedBy(2 * RENEW_INTERVAL_MS)).toBe(false);
      expect(await renewedBy(RENEW_INTERVAL_MS)).toBe(false);

      await ageLeases(owner, -1_000);
      const taken = await a.client.call(
        callerOf(GRACE),
        a.client.rpc('AcquireLock', { protocolId, sectionId }),
      );
      expect(taken.lock).toBe('held');
      await a.client.call(
        callerOf(GRACE),
        a.client.rpc('ReleaseLock', { protocolId, sectionId }),
      );
    } finally {
      await a.client.dispose();
    }
  });

  it('stops renewing a calling tab whose grace ended while the database was closed', async () => {
    const gate = closable();
    const a = await replica({ maintenance: gate.triggers });
    const { on } = tabOf('grace-closed');
    try {
      const channel = await watching(
        on('pb-ada-grace-closed-connection'),
        protocolId,
        a.client,
      );
      await a.client.call(
        on(),
        a.client.rpc('ResourcesList', {
          protocolId,
          editId: 'pb-grace-closed-edit',
          status: 'staged',
        }),
      );
      await channel.stop();
      await until(
        () => a.time.pending(RECONNECT_GRACE_MS) > 0,
        'the reconnect grace to start',
      );

      gate.setClosed(true);
      a.time.advance(RECONNECT_GRACE_MS);
      await until(
        () => a.spans.ended('protocolBuilder.graceElapsed') > 0,
        'the grace to end',
      );
      gate.setClosed(false);

      const passes = a.spans.count('protocolBuilder.liveness');
      await keeperTick(RENEW_INTERVAL_MS, a.time);
      expect(a.spans.count('protocolBuilder.liveness')).toBe(passes);
    } finally {
      await a.client.dispose();
    }
  });

  it('neither renews nor records contact while the database is closed to it', async () => {
    const gate = closable();
    const a = await replica({ maintenance: gate.triggers });
    const { on } = tabOf('closed');
    const caller = on('pb-ada-closed-connection');
    const list = () =>
      a.client.call(
        on(),
        a.client.rpc('ResourcesList', {
          protocolId,
          editId: 'pb-closed-edit',
          status: 'staged',
        }),
      );
    try {
      const channel = await watching(caller, protocolId, a.client);
      try {
        await keeperTick(RENEW_INTERVAL_MS, a.time);
        expect(a.spans.count('protocolBuilder.liveness')).toBeGreaterThan(0);

        gate.setClosed(true);
        const passes = a.spans.count('protocolBuilder.liveness');
        const contacts = a.spans.count('protocolBuilder.contact');
        await keeperTick(PAST_CONTACT_INTERVAL_MS, a.time);
        await list();
        await keeperTick(RENEW_INTERVAL_MS, a.time);
        expect(a.spans.count('protocolBuilder.liveness')).toBe(passes);
        expect(a.spans.count('protocolBuilder.contact')).toBe(contacts);

        gate.setClosed(false);
        await list();
        await keeperTick(RENEW_INTERVAL_MS, a.time);
        expect(a.spans.count('protocolBuilder.liveness')).toBeGreaterThan(
          passes,
        );
        expect(a.spans.count('protocolBuilder.contact')).toBeGreaterThan(
          contacts,
        );
      } finally {
        await channel.stop();
      }
    } finally {
      await a.client.dispose();
    }
  });

  it('warns once a draft’s liveness pass has waited on a lock several ticks in a row', async () => {
    const own = await suite.studioOnOwnPool(4);
    const time = makeShiftableClock();
    const logs: Array<{ level: LogLevel.LogLevel; text: string }> = [];
    const client = await createProtocolBuilderClient(own.studio, {
      clock: time.clock,
      objectStore,
      leases: Leases.layer.pipe(
        Layer.provide(
          Logger.layer([
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
      ),
    });
    const { on } = tabOf('starved');
    const waits = () =>
      logs
        .filter((log) => log.text.startsWith('Renewing'))
        .map((log) => log.level);
    try {
      const channel = await watching(
        on('pb-ada-starved-connection'),
        protocolId,
        client,
      );
      try {
        const held = await holdRow(
          'SELECT 1 FROM drafts WHERE id = $1 FOR UPDATE',
          [draftId],
        );
        try {
          for (const tick of [1, 2, 3]) {
            await keeperTick(RENEW_INTERVAL_MS, time);
            await until(
              () => waits().length >= tick,
              `liveness pass ${tick} to give up on the lock`,
              2 * LIVENESS_LOCK_TIMEOUT_MS,
            );
          }
          expect(waits()).toEqual(['Info', 'Info', 'Warn']);
        } finally {
          await held.release();
        }
      } finally {
        await channel.stop();
      }
    } finally {
      await client.dispose();
      await own.close();
    }
  });

  describe('releasing what a tab staged', () => {
    const stageOn = async (
      client: ProtocolBuilderTestClient,
      caller: Caller,
      editId: string,
    ) => {
      const staged = await client.call(
        caller,
        client.rpc('ResourcesStage', {
          protocolId,
          editId,
          requestId: `${editId}-file`,
          request: {
            kind: 'content',
            contentKind: 'image',
            name: 'A photograph',
            source: 'photo.png',
            contentType: 'image/png',
            bytes: new Uint8Array([137, 80, 78, 71]),
          },
        }),
      );
      if (staged.status !== 'ok') throw new Error(staged.failure.message);
      const [row] = await stagedOf(staged.data.descriptor.id);
      if (row === undefined) throw new Error('no staged row');
      return row.objectKey;
    };

    const stagedOf = (resourceId: string) =>
      teamRows<{ objectKey: string }>(
        `SELECT object_key AS "objectKey" FROM protocol_staged_resources
          WHERE resource_id = $1`,
        [resourceId],
      );

    const stagedBy = (owner: string) =>
      teamRows<{ objectKey: string }>(
        `SELECT object_key AS "objectKey" FROM protocol_staged_resources
          WHERE draft_id = $1 AND owner = $2`,
        [draftId, owner],
      );

    const releasing =
      (sectionId: string) => (entries: ReadonlyArray<LoggedProtocolEvent>) =>
        entries.some(
          ({ event }) => event.type === 'lock' && event.sectionId === sectionId,
        );

    /** A memory store whose staged deletes wait, once reached, for `release`. */
    const holdingDeletes = () => {
      const objects = memoryObjectStore();
      const reached = latch();
      const released = latch();
      const store = ObjectStore.of({
        ...objects.store,
        deleteStaged: (key) =>
          Effect.andThen(
            Effect.promise(() => {
              reached.open();
              return released.opened;
            }),
            objects.store.deleteStaged(key),
          ),
      });
      return {
        objects,
        store,
        reached: reached.opened,
        release: released.open,
      };
    };

    it('deletes the rows and objects of a tab whose grace ended', async () => {
      const objects = memoryObjectStore();
      const a = await replica({ objectStore: objects.store });
      const { owner, on } = tabOf('released-staging');
      const caller = on('pb-ada-released-staging-connection');
      try {
        const channel = await watching(caller, protocolId, a.client);
        const objectKey = await stageOn(
          a.client,
          caller,
          'pb-released-staging-edit',
        );
        await channel.stop();
        await until(
          () => a.time.pending(RECONNECT_GRACE_MS) > 0,
          'the reconnect grace to start',
        );

        a.time.advance(RECONNECT_GRACE_MS);
        await until(
          () => objects.removed().includes(objectKey),
          'the staged object to be deleted',
        );
        expect(await stagedBy(owner)).toEqual([]);
        expect(objects.keys()).not.toContain(objectKey);
      } finally {
        await a.client.dispose();
      }
    });

    it('keeps what a tab staged when its socket returns before the staging is released', async () => {
      const objects = memoryObjectStore();
      const events = holdingEvents();
      const a = await replica({
        objectStore: objects.store,
        events: events.layer,
      });
      const b = await replica({ objectStore: objects.store });
      const { owner, on } = tabOf('returning-staging');
      const first = on('pb-ada-returning-staging-connection');
      const again = on('pb-ada-returning-staging-again-connection');
      try {
        const stage = await createOn(a.client, 'Held by a returning tab');
        const sectionId = stage.sectionId;
        const channel = await watching(first, protocolId, a.client);
        await a.client.call(
          first,
          a.client.rpc('AcquireLock', { protocolId, sectionId }),
        );
        const objectKey = await stageOn(
          a.client,
          first,
          'pb-returning-staging-edit',
        );
        await channel.stop();
        await until(
          () => a.time.pending(RECONNECT_GRACE_MS) > 0,
          'the reconnect grace to start',
        );

        const published = events.next(releasing(sectionId));
        a.time.advance(RECONNECT_GRACE_MS);
        await published.reached;
        const returned = await watching(again, protocolId, b.client);
        try {
          published.release();
          await until(
            () => a.spans.ended('protocolBuilder.releaseStaged') > 0,
            'the staging release',
          );
          expect(await stagedBy(owner)).toEqual([{ objectKey }]);
          expect(objects.keys()).toContain(objectKey);
        } finally {
          await returned.stop();
        }
      } finally {
        await b.client.dispose();
        await a.client.dispose();
      }
    });

    it('publishes a released tab’s locks while its staged objects are still being deleted', async () => {
      const deletes = holdingDeletes();
      const events = holdingEvents();
      const a = await replica({
        objectStore: deletes.store,
        events: events.layer,
      });
      const { owner, on } = tabOf('slow-staging');
      const caller = on('pb-ada-slow-staging-connection');
      try {
        const stage = await createOn(a.client, 'Held over a slow store');
        const sectionId = stage.sectionId;
        const channel = await watching(caller, protocolId, a.client);
        await a.client.call(
          caller,
          a.client.rpc('AcquireLock', { protocolId, sectionId }),
        );
        const objectKey = await stageOn(
          a.client,
          caller,
          'pb-slow-staging-edit',
        );
        await channel.stop();
        await until(
          () => a.time.pending(RECONNECT_GRACE_MS) > 0,
          'the reconnect grace to start',
        );

        const published = events.next(releasing(sectionId));
        let announced = false;
        void published.reached.then(() => {
          announced = true;
          published.release();
        });
        a.time.advance(RECONNECT_GRACE_MS);
        try {
          await until(() => announced, 'the lock release to be published');
          await deletes.reached;
        } finally {
          deletes.release();
        }
        await until(
          () => deletes.objects.removed().includes(objectKey),
          'the staged object to be deleted',
        );
        expect(await stagedBy(owner)).toEqual([]);
      } finally {
        await a.client.dispose();
      }
    });
  });
});
