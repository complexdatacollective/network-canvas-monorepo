import { randomBytes, randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import {
  claimTemplateRegistryIntent,
  reconcileNextTemplateRegistryIntent,
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
});
