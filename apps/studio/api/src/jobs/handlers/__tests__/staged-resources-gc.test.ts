import { randomUUID } from 'node:crypto';

import { Effect } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  insertTeam,
  openTestDatabase,
  ownerRows,
  type TestDatabaseRuntime,
  testDb,
  uniqueTeamId,
} from '../../../__tests__/support/database.ts';
import {
  type MemoryObjectStore,
  memoryObjectStore,
} from '../../../__tests__/support/object-store.ts';
import { mintStagingKey } from '../../../protocol-builder/staging-store.ts';
import { ObjectStore } from '../../../storage/object-store.ts';
import {
  CONNECTION_RETENTION_MS,
  gcStagedResources,
  STAGED_ORPHAN_GRACE_MS,
} from '../staged-resources-gc.ts';

const MINUTE = 60_000;

/** Past the idle bound, which is five minutes. */
const LONG_AGO = 10 * MINUTE;

describe.skipIf(!testDb)('collecting abandoned staged resources', () => {
  let database: TestDatabaseRuntime | undefined;

  beforeAll(async () => {
    database = await openTestDatabase();
  });

  afterAll(async () => {
    await database?.dispose();
  });

  const run: TestDatabaseRuntime['run'] = (effect) => {
    if (database === undefined) throw new Error('the database is not open');
    return database.run(effect);
  };

  const seedDraft = async () => {
    const teamId = uniqueTeamId('staged-gc');
    const draftId = randomUUID();
    await run(insertTeam(teamId));
    await run(
      ownerRows(
        `INSERT INTO drafts (id, team_id, head_seq, head_manifest_hash)
         VALUES ($1, $2, 0, 'head')`,
        [draftId, teamId],
      ),
    );
    return { teamId, draftId };
  };

  type Draft = Awaited<ReturnType<typeof seedDraft>>;

  /** A staged file whose object is in `objects`, staged `agoMs` ago. */
  const stageFile = async (
    draft: Draft,
    objects: MemoryObjectStore,
    owner: string,
    agoMs: number,
  ) => {
    const key = mintStagingKey(draft.teamId);
    await run(
      objects.store.putStaged(key, new Uint8Array([1, 2, 3]), 'text/plain'),
    );
    const resourceId = randomUUID();
    await run(
      ownerRows(
        `INSERT INTO protocol_staged_resources
           (team_id, draft_id, owner, edit_id, resource_id, request_id, kind,
            descriptor, object_key, created_at)
         VALUES ($1, $2, $3, 'edit', $4, $4, 'content', '{}'::jsonb, $5,
                 clock_timestamp() - make_interval(secs => $6::float8 / 1000))`,
        [draft.teamId, draft.draftId, owner, resourceId, key, agoMs],
      ),
    );
    return { resourceId, key };
  };

  const stageSecret = async (draft: Draft, owner: string, agoMs: number) => {
    const resourceId = randomUUID();
    await run(
      ownerRows(
        `INSERT INTO protocol_staged_resources
           (team_id, draft_id, owner, edit_id, resource_id, request_id, kind,
            descriptor, secret_ciphertext, secret_key_id, created_at)
         VALUES ($1, $2, $3, 'edit', $4, $4, 'secret', '{}'::jsonb,
                 '\\x00'::bytea, 'key',
                 clock_timestamp() - make_interval(secs => $5::float8 / 1000))`,
        [draft.teamId, draft.draftId, owner, resourceId, agoMs],
      ),
    );
    return resourceId;
  };

  /** A connection row for `owner` that expires `inMs` from now (or before). */
  const connect = async (draft: Draft, owner: string, inMs: number) => {
    const connectionId = randomUUID();
    await run(
      ownerRows(
        `INSERT INTO protocol_connections
           (team_id, draft_id, connection_id, kind, owner, user_id,
            display_name, mode, replica_id, expires_at)
         VALUES ($1, $2, $3, 'contact', $4, 'user', 'User', 'editing',
                 'replica',
                 clock_timestamp() + make_interval(secs => $5::float8 / 1000))`,
        [draft.teamId, draft.draftId, connectionId, owner, inMs],
      ),
    );
    return connectionId;
  };

  const stagedIds = async (draft: Draft) => {
    const rows = await run(
      ownerRows<{ resource_id: string }>(
        'SELECT resource_id FROM protocol_staged_resources WHERE draft_id = $1',
        [draft.draftId],
      ),
    );
    return rows.map((row) => row.resource_id).toSorted();
  };

  const connectionIds = async (draft: Draft) => {
    const rows = await run(
      ownerRows<{ connection_id: string }>(
        'SELECT connection_id FROM protocol_connections WHERE draft_id = $1',
        [draft.draftId],
      ),
    );
    return rows.map((row) => row.connection_id).toSorted();
  };

  const collect = (objects: MemoryObjectStore) =>
    run(Effect.provideService(gcStagedResources(), ObjectStore, objects.store));

  it('collects what a tab no replica has heard from staged, and keeps the rest', async () => {
    const draft = await seedDraft();
    const objects = memoryObjectStore();

    const gone = await stageFile(draft, objects, 'gone', LONG_AGO);
    const goneSecret = await stageSecret(draft, 'gone', LONG_AGO);
    const longExpired = await connect(
      draft,
      'gone',
      -(CONNECTION_RETENTION_MS + MINUTE),
    );

    const live = await stageFile(draft, objects, 'live', LONG_AGO);
    const liveConnection = await connect(draft, 'live', MINUTE);

    // Away for a minute: still inside the idle bound, so it may yet return.
    const away = await stageFile(draft, objects, 'away', LONG_AGO);
    const awayConnection = await connect(draft, 'away', -MINUTE);

    // Staged a moment ago by a tab whose connection is not yet recorded.
    const fresh = await stageFile(draft, objects, 'fresh', 0);

    const oldOrphan = mintStagingKey(draft.teamId);
    const youngOrphan = mintStagingKey(draft.teamId);
    await run(
      objects.store.putStaged(oldOrphan, new Uint8Array([4]), 'text/plain'),
    );
    objects.backdate(oldOrphan, STAGED_ORPHAN_GRACE_MS + MINUTE);
    await run(
      objects.store.putStaged(youngOrphan, new Uint8Array([5]), 'text/plain'),
    );

    const result = await collect(objects);

    expect(await stagedIds(draft)).toEqual(
      [live.resourceId, away.resourceId, fresh.resourceId].toSorted(),
    );
    expect(await stagedIds(draft)).not.toContain(goneSecret);
    expect(objects.keys().toSorted()).toEqual(
      [live.key, away.key, fresh.key, youngOrphan].toSorted(),
    );
    expect(objects.removed().toSorted()).toEqual(
      [gone.key, oldOrphan].toSorted(),
    );
    expect(result.stagedObjectsDeleted).toBe(2);
    expect(await connectionIds(draft)).toEqual(
      [liveConnection, awayConnection].toSorted(),
    );
    expect(await connectionIds(draft)).not.toContain(longExpired);
  });

  it('keeps an abandoned row while the store will not delete its object', async () => {
    const draft = await seedDraft();
    const objects = memoryObjectStore();

    const file = await stageFile(draft, objects, 'gone', LONG_AGO);
    const secret = await stageSecret(draft, 'gone', LONG_AGO);
    const longExpired = await connect(
      draft,
      'gone',
      -(CONNECTION_RETENTION_MS + MINUTE),
    );

    objects.setUnreachable(true);
    await collect(objects);

    expect(await stagedIds(draft)).toEqual([file.resourceId]);
    expect(await stagedIds(draft)).not.toContain(secret);
    expect(await connectionIds(draft)).not.toContain(longExpired);

    objects.setUnreachable(false);
    await collect(objects);

    expect(await stagedIds(draft)).toEqual([]);
    expect(objects.keys()).not.toContain(file.key);
  });
});
