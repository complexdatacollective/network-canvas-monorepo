import { Effect, Option } from 'effect';
import { beforeAll, describe, expect, it } from 'vitest';

import { testDb } from '../../__tests__/support/database.ts';
import {
  ADA,
  callerOf,
  GRACE,
  setupProtocolBuilderSuite,
  until,
} from '../../__tests__/support/protocol-builder-suite.ts';
import {
  type Caller,
  createProtocolBuilderClient,
  makeShiftableClock,
  makeSpanCounter,
} from '../../__tests__/support/protocol-builder.ts';
import type { Studio } from '../../app.ts';
import {
  type Closure,
  MaintenanceTriggers,
} from '../../http/middleware/maintenance.ts';
import {
  IDLE_MS,
  Leases,
  RECONNECT_GRACE_MS,
  RENEW_INTERVAL_MS,
} from '../leases.ts';

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
    watching,
    createOn,
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

  const replica = async (maintenance?: MaintenanceTriggers['Service']) => {
    const time = makeShiftableClock();
    const spans = makeSpanCounter();
    const client = await createProtocolBuilderClient(studio, {
      clock: time.clock,
      objectStore,
      tracer: spans.tracer,
      ...(maintenance === undefined ? {} : { maintenance }),
    });
    return {
      client,
      time,
      spans,
      connected: (owner: string) =>
        client.run(Leases.use((leases) => leases.connected(owner))),
    };
  };

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
        expect(await a.connected(owner)).toBe(true);
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

  it('waits out the grace again while the tab is connected through another replica, then gives its leases back once that lapses', async () => {
    const a = await replica();
    const gate = closable();
    const b = await replica(gate.triggers);
    const { owner, on } = tabOf('roaming');
    const onA = on('pb-ada-roaming-a-connection');
    const onB = on('pb-ada-roaming-b-connection');
    try {
      const stage = await createOn(a.client, 'Held across two replicas');
      const sectionId = stage.sectionId;
      const watchedOnA = await watching(onA, protocolId, a.client);
      const watchedOnB = await watching(onB, protocolId, b.client);
      try {
        await a.client.call(
          onA,
          a.client.rpc('AcquireLock', { protocolId, sectionId }),
        );
        await watchedOnA.stop();
        await until(
          () => a.time.pending(RECONNECT_GRACE_MS) > 0,
          'the reconnect grace to start',
        );

        a.time.advance(RECONNECT_GRACE_MS);
        await until(
          () => a.spans.ended('protocolBuilder.releaseOwner') > 0,
          'the release to be attempted',
        );
        expect(await releasesOf(sectionId)).toBe(0);
        expect(await liveLeases(owner)).toEqual([sectionId]);

        // Replica B stops renewing, as a replica that went away would.
        gate.setClosed(true);
        await ageConnections({ owner, kind: 'socket' }, -1_000);
        // Past the longest wait the retry can have been given: B's whole TTL.
        a.time.advance(RECONNECT_GRACE_MS + RENEW_INTERVAL_MS);
        await until(
          async () => (await releasesOf(sectionId)) === 1,
          'the stranded lease to be given back',
        );
        expect(await liveLeases(owner)).toEqual([]);
      } finally {
        await watchedOnB.stop();
      }
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

  it('keeps a calling tab’s lease renewed until it has been idle a while', async () => {
    const a = await replica();
    const { owner, on } = tabOf('calling');
    const caller = on();
    try {
      const stage = await createOn(a.client, 'Held by calls alone');
      const sectionId = stage.sectionId;
      const held = await a.client.call(
        caller,
        a.client.rpc('AcquireLock', { protocolId, sectionId }),
      );
      expect(held.lock).toBe('held');
      const granted = await leaseExpiry(owner);
      if (granted === undefined) throw new Error('the tab holds no lease');

      await keeperTick(RENEW_INTERVAL_MS, a.time);
      expect(await leaseExpiry(owner)).toBeGreaterThan(granted);

      await keeperTick(IDLE_MS, a.time);
      const renewals = a.spans.count('sync.renewHeld');
      const idle = await leaseExpiry(owner);
      await keeperTick(RENEW_INTERVAL_MS, a.time);
      expect(a.spans.count('sync.renewHeld')).toBe(renewals);
      expect(await leaseExpiry(owner)).toBe(idle);

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

  it('neither renews nor records contact while the database is closed to it', async () => {
    const gate = closable();
    const a = await replica(gate.triggers);
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
});
