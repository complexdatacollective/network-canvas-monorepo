// Two team-pinned servers over one database: identical content stays per-team,
// and no lease, read, or resume crosses the boundary.
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  UnknownDraftError,
  UnknownSectionDocumentError,
  UnknownSectionError,
} from '../server.ts';
import {
  DEFAULT_SECTIONS,
  TEST_TEAM_ID,
  dbAvailable,
  makeDraft,
  makeServer,
  makeSyncFacade,
  type SyncFacade,
} from './helpers.ts';

const OTHER_TEAM_ID = 'team-other';

describe.skipIf(!dbAvailable)('team isolation', () => {
  let db: Pool;
  let dispose: () => Promise<void>;
  let server: SyncFacade;
  let otherServer: SyncFacade;

  beforeAll(async () => {
    let run;
    ({ db, run, server, dispose } = await makeServer('sync_tenancy'));
    // The same database, the same client, a different team stamped on every
    // transaction — which is the only thing standing between the two.
    otherServer = makeSyncFacade((body, options) =>
      run(body, { ...options, teamId: OTHER_TEAM_ID }),
    );
  });
  afterAll(async () => {
    await dispose();
  });

  it('stores identical section content once per team', async () => {
    await makeDraft(server);
    await makeDraft(otherServer);
    const rows = await db.query(
      `SELECT team_id, count(*)::int AS c FROM sections
       GROUP BY team_id ORDER BY team_id`,
    );
    expect(rows.rows).toEqual([
      { team_id: 'team-other', c: Object.keys(DEFAULT_SECTIONS).length },
      {
        team_id: TEST_TEAM_ID,
        c: Object.keys(DEFAULT_SECTIONS).length,
      },
    ]);
  });

  it('refuses leases, reads, and resume across the boundary', async () => {
    const draft = await makeDraft(server);
    await expect(
      otherServer.acquire(draft, 'stage-1', 'tab-x'),
    ).rejects.toThrow(UnknownSectionError);
    await expect(otherServer.resume(draft, 'tab-x')).rejects.toThrow(
      UnknownDraftError,
    );

    const hash = (await server.resume(draft, 'tab-x')).sectionHashes[
      'stage-1'
    ]!;
    await expect(server.getSection(hash)).resolves.toBeDefined();

    const inOther = await db.query(
      `SELECT 1 FROM sections WHERE team_id = 'team-other' AND hash = $1`,
      [hash],
    );
    expect(inOther.rowCount).toBe(1); // identical content exists there too…
    await server.commit({
      draftId: draft,
      sectionId: 'stage-1',
      owner: 'tab-y',
      epoch: (await server.acquire(draft, 'stage-1', 'tab-y'))!.epoch,
      clientSeq: 1n,
      commands: [{ op: 'set', key: 'label', value: 'Distinct in team-test' }],
    });
    const distinctHash = (await server.resume(draft, 'tab-y')).sectionHashes[
      'stage-1'
    ]!;
    // …but a hash minted only in team-test is invisible to team-other.
    await expect(otherServer.getSection(distinctHash)).rejects.toThrow(
      UnknownSectionDocumentError,
    );
  });
});
