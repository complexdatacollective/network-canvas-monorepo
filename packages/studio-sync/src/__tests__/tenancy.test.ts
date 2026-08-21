// Two workspace-pinned servers over one database: identical content stays
// per-workspace, and no lease, read, or resume crosses the boundary.
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  SyncServer,
  UnknownDraftError,
  UnknownSectionDocumentError,
  UnknownSectionError,
} from '../server.ts';
import { createTenantDb } from '../tenant.ts';
import {
  DEFAULT_SECTIONS,
  TEST_WORKSPACE_ID,
  dbAvailable,
  makeDraft,
  makeServer,
} from './helpers.ts';

describe.skipIf(!dbAvailable)('workspace isolation', () => {
  let db: Pool;
  let server: SyncServer;
  let otherServer: SyncServer;

  beforeAll(async () => {
    ({ db, server } = await makeServer('sync_tenancy'));
    otherServer = new SyncServer(createTenantDb(db, 'ws-other'));
  });
  afterAll(async () => {
    await db.end();
  });

  it('stores identical section content once per workspace', async () => {
    await makeDraft(server);
    await makeDraft(otherServer);
    const rows = await db.query(
      `SELECT workspace_id, count(*)::int AS c FROM sections
       GROUP BY workspace_id ORDER BY workspace_id`,
    );
    expect(rows.rows).toEqual([
      { workspace_id: 'ws-other', c: Object.keys(DEFAULT_SECTIONS).length },
      {
        workspace_id: TEST_WORKSPACE_ID,
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
      `SELECT 1 FROM sections WHERE workspace_id = 'ws-other' AND hash = $1`,
      [hash],
    );
    expect(inOther.rowCount).toBe(1); // identical content exists there too…
    await server.commit({
      draftId: draft,
      sectionId: 'stage-1',
      owner: 'tab-y',
      epoch: (await server.acquire(draft, 'stage-1', 'tab-y'))!.epoch,
      clientSeq: 1n,
      commands: [{ op: 'set', key: 'label', value: 'Distinct in ws-test' }],
    });
    const distinctHash = (await server.resume(draft, 'tab-y')).sectionHashes[
      'stage-1'
    ]!;
    // …but a hash minted only in ws-test is invisible to ws-other.
    await expect(otherServer.getSection(distinctHash)).rejects.toThrow(
      UnknownSectionDocumentError,
    );
  });
});
