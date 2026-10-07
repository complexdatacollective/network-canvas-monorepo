import { describe, expect, it } from 'vitest';

import { testDb } from '../../__tests__/support/database.ts';
import {
  ADA,
  GRACE,
  setupProtocolBuilderSuite,
} from '../../__tests__/support/protocol-builder-suite.ts';
import type { Caller } from '../../__tests__/support/protocol-builder.ts';

describe.skipIf(!testDb)('presence', () => {
  const suite = setupProtocolBuilderSuite();
  const { teamRows, ageConnections, present, watching, createStage } = suite;

  const callerOn = (
    who: typeof ADA,
    slug: string,
  ): Caller & { connection: string } => ({
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
      // The watch that connected first stops showing the lock, as a row
      // written before the lock was taken would.
      await teamRows(
        `UPDATE protocol_connections
            SET mode = 'viewing', section_id = NULL
          WHERE connection_id = (
            SELECT connection_id FROM protocol_connections
             WHERE draft_id = $1 AND socket_id = $2
             ORDER BY created_at LIMIT 1)`,
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
