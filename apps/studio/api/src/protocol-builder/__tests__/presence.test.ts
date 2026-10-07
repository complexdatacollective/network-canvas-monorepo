import { describe, expect, it } from 'vitest';

import type { ProtocolSectionId } from '@codaco/studio-sync/taxonomy';

import { testDb } from '../../__tests__/support/database.ts';
import {
  ADA,
  GRACE,
  setupProtocolBuilderSuite,
  until,
} from '../../__tests__/support/protocol-builder-suite.ts';
import type { Caller } from '../../__tests__/support/protocol-builder.ts';

describe.skipIf(!testDb)('presence', () => {
  const suite = setupProtocolBuilderSuite();
  const {
    teamRows,
    ageConnections,
    connectionRows,
    present,
    watching,
    createStage,
  } = suite;

  const callerOn = (
    who: typeof ADA,
    slug: string,
  ): Caller & { connection: string; tab: string } => ({
    principal: who.principal,
    connection: `pb-presence-${slug}-connection`,
    tab: `pb-presence-${slug}-tab`,
  });

  const listed = async (connections: ReadonlyArray<string>) =>
    (await present()).filter((who) => connections.includes(who.sessionId));

  it('lists a socket carrying several watches once, editing if any of them is', async () => {
    const stage = await createStage(ADA, 'Edited over a shared socket');
    const caller = callerOn(ADA, 'shared');
    const first = await watching(caller, suite.protocolId);
    const second = await watching(caller, suite.protocolId);
    try {
      await suite.call(
        caller,
        suite.host.rpc('AcquireLock', {
          protocolId: suite.protocolId,
          sectionId: stage.sectionId,
        }),
      );
      await until(
        async () =>
          (await connectionRows()).filter(
            (row) =>
              row.live &&
              row.socket_id === caller.connection &&
              row.mode === 'editing',
          ).length === 2,
        'both watches to show the lock',
      );
      // The watch listed last stops showing the lock, as a row written before
      // the lock was taken would.
      await teamRows(
        `UPDATE protocol_connections
            SET mode = 'viewing', section_id = NULL
          WHERE connection_id = (
            SELECT connection_id FROM protocol_connections
             WHERE draft_id = $1 AND socket_id = $2
             ORDER BY created_at DESC, connection_id DESC LIMIT 1)`,
        [suite.draftId, caller.connection],
      );

      expect(await listed([caller.connection])).toEqual([
        expect.objectContaining({
          sessionId: caller.connection,
          userId: ADA.principal.userId,
          mode: 'editing',
          sectionId: stage.sectionId,
        }),
      ]);
      await suite.call(
        caller,
        suite.host.rpc('ReleaseLock', {
          protocolId: suite.protocolId,
          sectionId: stage.sectionId,
        }),
      );
    } finally {
      await second.stop();
      await first.stop();
    }
  });

  it('lists sockets in the order they connected', async () => {
    const earlier = callerOn(GRACE, 'earlier');
    const later = callerOn(ADA, 'later');
    const first = await watching(earlier, suite.protocolId);
    const second = await watching(later, suite.protocolId);
    try {
      // Rewritten to the end of the heap and to the later expiry, so neither
      // a scan nor the expiry index returns the rows in connection order.
      await teamRows(
        `UPDATE protocol_connections
            SET created_at = created_at - interval '1 hour',
                expires_at = expires_at + interval '1 minute'
          WHERE draft_id = $1 AND socket_id = $2`,
        [suite.draftId, earlier.connection],
      );
      expect(
        (await listed([later.connection, earlier.connection])).map(
          (who) => who.sessionId,
        ),
      ).toEqual([earlier.connection, later.connection]);
    } finally {
      await second.stop();
      await first.stop();
    }
  });

  const shownFor = async (tab: string) =>
    (await connectionRows())
      .filter(
        (row) =>
          row.live &&
          row.kind === 'socket' &&
          row.owner === `${ADA.principal.userId}:${tab}`,
      )
      .map((row) => ({ mode: row.mode, sectionId: row.section_id }));

  const lock = (
    caller: Caller,
    rpc: 'AcquireLock' | 'ReleaseLock',
    sectionId: ProtocolSectionId,
  ) =>
    suite.call(
      caller,
      suite.host.rpc(rpc, { protocolId: suite.protocolId, sectionId }),
    );

  it('changes only the calling tab’s rows on a socket other tabs share', async () => {
    const held = await createStage(ADA, 'Held by one tab of a shared socket');
    const passing = await createStage(ADA, 'Passed through by the other tab');
    const holder = callerOn(ADA, 'holder');
    const passer = { ...holder, tab: 'pb-presence-passer-tab' };
    const first = await watching(holder, suite.protocolId);
    const second = await watching(passer, suite.protocolId);
    try {
      await lock(holder, 'AcquireLock', held.sectionId);
      await lock(passer, 'AcquireLock', passing.sectionId);
      await lock(passer, 'ReleaseLock', passing.sectionId);

      const shown = async () =>
        JSON.stringify([
          await shownFor(holder.tab),
          await shownFor(passer.tab),
        ]);
      const expected = JSON.stringify([
        [{ mode: 'editing', sectionId: held.sectionId }],
        [{ mode: 'viewing', sectionId: null }],
      ]);
      await until(
        async () => (await shown()) === expected,
        'each tab to show only its own lock',
      );
      await lock(holder, 'ReleaseLock', held.sectionId);
    } finally {
      await second.stop();
      await first.stop();
    }
  });

  it('leaves a login’s HTTP watch showing what it adopted while its unary calls take and give back locks', async () => {
    const held = await createStage(ADA, 'Held before an HTTP watch');
    const later = await createStage(ADA, 'Taken by a unary call later');
    const passing = await createStage(ADA, 'Passed through by another tab');
    const watcher: Caller = {
      principal: ADA.principal,
      tab: 'pb-presence-http-tab',
    };
    const other: Caller = {
      principal: ADA.principal,
      tab: 'pb-presence-unary-tab',
    };
    await lock(watcher, 'AcquireLock', held.sectionId);
    const channel = await watching(watcher, suite.protocolId);
    try {
      const adopted = [{ mode: 'editing', sectionId: held.sectionId }];
      expect(await shownFor('pb-presence-http-tab')).toEqual(adopted);

      await lock(other, 'AcquireLock', passing.sectionId);
      await lock(other, 'ReleaseLock', passing.sectionId);
      expect(await shownFor('pb-presence-http-tab')).toEqual(adopted);

      await lock(watcher, 'AcquireLock', later.sectionId);
      expect(await shownFor('pb-presence-http-tab')).toEqual(adopted);
      await lock(watcher, 'ReleaseLock', later.sectionId);
    } finally {
      await channel.stop();
      await lock(watcher, 'ReleaseLock', held.sectionId);
    }
  });

  it('leaves out a socket whose row has lapsed', async () => {
    const lapsed = callerOn(ADA, 'lapsed');
    const channel = await watching(lapsed, suite.protocolId);
    try {
      expect(await listed([lapsed.connection])).toHaveLength(1);
      await ageConnections({ socketId: lapsed.connection }, -1_000);
      expect(await listed([lapsed.connection])).toEqual([]);
    } finally {
      await channel.stop();
    }
  });
});
