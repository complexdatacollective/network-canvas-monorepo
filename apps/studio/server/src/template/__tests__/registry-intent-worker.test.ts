import { randomBytes, randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import {
  claimTemplateRegistryIntent,
  reconcileNextTemplateRegistryIntent,
  startTemplateRegistryIntentWorker,
} from '../registry-intent-worker.ts';

const db = await reachableDb();
const TEAM_ID = 'registry-intent-worker';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe.skipIf(!db)('Template Registry intent worker', () => {
  let owner: pg.Pool;
  let app: pg.Pool;
  let maintenance: pg.Pool;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    ({
      pool: owner,
      app,
      maintenance,
      dispose,
    } = await createScratchSchema(db));
    await provisionScratchSchema(owner);
    await seedTeam(owner, TEAM_ID);
  });

  afterAll(async () => await dispose());

  beforeEach(async () => {
    await owner.query('DELETE FROM template_registry_publication_intents');
    await owner.query('DELETE FROM template_registry_import_intents');
  });

  async function intent(quarantined = false): Promise<string> {
    const id = randomUUID();
    await owner.query(
      `INSERT INTO template_registry_import_intents
        (id, team_id, registry_url, registry_entry_id, registry_root,
         entry_snapshot, asset_manifest, target_template_id, target_version_id,
         initiating_actor_id, initiating_actor_label, initiating_request_id,
         quarantined_at)
       VALUES ($1, $2, 'https://registry.example', $3, $4, '{}', '[]', $5, $6,
         'admin', 'Registry Admin', $7,
         CASE WHEN $8 THEN clock_timestamp() ELSE NULL END)`,
      [
        id,
        TEAM_ID,
        randomUUID(),
        randomBytes(32).toString('hex'),
        randomUUID(),
        randomUUID(),
        randomUUID(),
        quarantined,
      ],
    );
    return id;
  }

  it('leases one intent to one worker and skips recovery-quarantined work', async () => {
    const id = await intent();
    await intent(true);
    const started = deferred();
    const release = deferred();
    const first = reconcileNextTemplateRegistryIntent({
      pool: maintenance,
      process: async (claim) => {
        expect(claim).toMatchObject({ id, kind: 'import', teamId: TEAM_ID });
        started.resolve();
        await release.promise;
        await maintenance.query(
          `UPDATE template_registry_import_intents
           SET completed_at = clock_timestamp(), lease_owner = NULL,
               lease_expires_at = NULL
           WHERE id = $1 AND lease_owner = $2`,
          [claim.id, claim.leaseOwner],
        );
        return 'completed';
      },
    });
    await started.promise;
    await expect(
      reconcileNextTemplateRegistryIntent({
        pool: maintenance,
        process: async () => {
          throw new Error('a leased intent must not be claimed twice');
        },
      }),
    ).resolves.toEqual({ claimed: 0 });
    release.resolve();
    await expect(first).resolves.toEqual({ claimed: 1 });
    await expect(claimTemplateRegistryIntent(maintenance)).resolves.toBeNull();
  });

  it('releases a failed attempt for bounded retry without losing its intent', async () => {
    const id = await intent();
    await expect(
      reconcileNextTemplateRegistryIntent({
        pool: maintenance,
        process: async () => {
          throw new Error('simulated reconciliation failure');
        },
      }),
    ).rejects.toThrow('simulated reconciliation failure');
    const row = await owner.query<{
      attempt_count: number;
      lease_owner: string | null;
      delayed: boolean;
    }>(
      `SELECT attempt_count, lease_owner,
              available_at > statement_timestamp() AS delayed
       FROM template_registry_import_intents WHERE id = $1`,
      [id],
    );
    expect(row.rows).toEqual([
      { attempt_count: 1, lease_owner: null, delayed: true },
    ]);
  });

  it('refuses to claim through the application database role', async () => {
    await intent();
    await expect(claimTemplateRegistryIntent(app)).rejects.toThrow(
      'Registry intent worker requires the maintenance role',
    );
  });

  it('claims the oldest kind so publications cannot starve imports', async () => {
    const importId = await intent();
    await owner.query(
      `UPDATE template_registry_import_intents
       SET created_at = clock_timestamp() - interval '1 hour'
       WHERE id = $1`,
      [importId],
    );
    const templateId = randomUUID();
    const versionId = randomUUID();
    const manifestHash = randomBytes(32).toString('hex');
    await owner.query(
      `INSERT INTO templates (id, team_id, kind, name)
       VALUES ($1, $2, 'protocol', 'Fair publication')`,
      [templateId, TEAM_ID],
    );
    await owner.query(
      `INSERT INTO template_versions
        (id, team_id, template_id, version_number, manifest, manifest_hash,
         schema_version)
       VALUES ($1, $2, $3, 1, '{}', $4, 1)`,
      [versionId, TEAM_ID, templateId, manifestHash],
    );
    await owner.query(
      `INSERT INTO template_registry_publication_intents
        (id, team_id, template_version_id, registry_url, registry_root,
         publisher_id, publisher_name, initiating_actor_id,
         initiating_actor_label, initiating_request_id)
       VALUES ($1, $2, $3, 'https://registry.example', $4, $5,
         'Publisher', 'admin', 'Registry Admin', $6)`,
      [
        randomUUID(),
        TEAM_ID,
        versionId,
        randomBytes(32).toString('hex'),
        randomUUID(),
        randomUUID(),
      ],
    );
    await expect(
      claimTemplateRegistryIntent(maintenance),
    ).resolves.toMatchObject({ id: importId, kind: 'import' });
  });

  it('renews a short lease while an external effect is in progress', async () => {
    const id = await intent();
    const started = deferred();
    const release = deferred();
    const running = reconcileNextTemplateRegistryIntent({
      pool: maintenance,
      leaseMs: 60,
      process: async (claim) => {
        started.resolve();
        await release.promise;
        const completed = await maintenance.query(
          `UPDATE template_registry_import_intents
           SET completed_at = clock_timestamp(), lease_owner = NULL,
               lease_expires_at = NULL
           WHERE id = $1 AND lease_owner = $2`,
          [id, claim.leaseOwner],
        );
        expect(completed.rowCount).toBe(1);
        return 'completed';
      },
    });
    await started.promise;
    await new Promise((resolve) => setTimeout(resolve, 90));
    await expect(
      reconcileNextTemplateRegistryIntent({
        pool: maintenance,
        leaseMs: 60,
        process: async () => {
          throw new Error('renewed intent must not be claimed twice');
        },
      }),
    ).resolves.toEqual({ claimed: 0 });
    release.resolve();
    await expect(running).resolves.toEqual({ claimed: 1 });
  });

  it('defers an unresolved public lookup instead of spinning on an expired lease', async () => {
    const id = await intent();
    await expect(
      reconcileNextTemplateRegistryIntent({
        pool: maintenance,
        retryMs: 60_000,
        process: async () => 'deferred',
      }),
    ).resolves.toEqual({ claimed: 1 });
    const row = await owner.query<{
      lease_owner: string | null;
      delayed: boolean;
    }>(
      `SELECT lease_owner, available_at > statement_timestamp() AS delayed
       FROM template_registry_import_intents WHERE id = $1`,
      [id],
    );
    expect(row.rows).toEqual([{ lease_owner: null, delayed: true }]);
  });

  it('starts a polling worker that resumes a persisted intent', async () => {
    const id = await intent();
    const completed = deferred();
    const worker = startTemplateRegistryIntentWorker({
      pool: maintenance,
      pollIntervalMs: 10,
      drainLimit: 1,
      process: async (claim) => {
        const updated = await maintenance.query(
          `UPDATE template_registry_import_intents
           SET completed_at=clock_timestamp(),lease_owner=NULL,
               lease_expires_at=NULL
           WHERE id=$1 AND lease_owner=$2`,
          [claim.id, claim.leaseOwner],
        );
        expect(updated.rowCount).toBe(1);
        completed.resolve();
        return 'completed';
      },
    });
    try {
      await Promise.race([
        completed.promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('worker did not resume')), 1_000),
        ),
      ]);
    } finally {
      await worker.stop();
    }
    await expect(
      owner.query(
        `SELECT completed_at IS NOT NULL AS completed
         FROM template_registry_import_intents WHERE id=$1`,
        [id],
      ),
    ).resolves.toHaveProperty('rows', [{ completed: true }]);
  });
});
