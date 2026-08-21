import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type pg from 'pg';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { createTenantDb, type TenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedWorkspace,
} from '../../__tests__/support/postgres.ts';

export const storeDb = await reachableDb();

export const TEST_WORKSPACE_ID = 'ws-test';

export const GC_OPTS = {
  retainManifestsPerDraft: 0,
  sectionGraceMs: 60_000,
  commandRetryHorizonMs: 0,
};

/** Backdates the sweep quarantine so a GC run can collect immediately. */
export async function ageQuarantine(
  db: pg.Pool,
  workspaceId?: string,
): Promise<void> {
  await db.query(
    `UPDATE sections SET unreferenced_at = unreferenced_at - interval '1 hour'
     ${workspaceId === undefined ? '' : 'WHERE workspace_id = $1'}`,
    workspaceId === undefined ? [] : [workspaceId],
  );
}

export async function makeStoreSchema(): Promise<{
  db: pg.Pool;
  tenantDb: TenantDb;
  dispose: () => Promise<void>;
}> {
  if (!storeDb) throw new Error('unreachable: probe guaranteed a database');
  const scratch = await createScratchSchema(storeDb);
  try {
    await provisionScratchSchema(scratch.pool);
    await seedWorkspace(scratch.pool, TEST_WORKSPACE_ID);
  } catch (error) {
    await scratch.dispose();
    throw error;
  }
  return {
    db: scratch.pool,
    tenantDb: createTenantDb(scratch.pool, TEST_WORKSPACE_ID),
    dispose: scratch.dispose,
  };
}

// Resolved through the exports map so that changing a fixture invalidates this
// suite's Turbo cache.
export function readFixtureProtocol(specifier: string): CurrentProtocol {
  const resolved = import.meta.resolve(specifier);
  return JSON.parse(
    readFileSync(fileURLToPath(resolved), 'utf8'),
  ) as CurrentProtocol;
}

export const FIXTURES = [
  '@codaco/protocols/e2e/all-interfaces/protocol.json',
  '@codaco/protocols/sample',
  '@codaco/protocols/development',
] as const;

export function baseProtocol(): CurrentProtocol {
  return {
    name: 'Test Protocol',
    schemaVersion: 8,
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            personName: {
              name: 'Name',
              type: 'text',
              component: 'Text',
            },
            layoutPosition: {
              name: 'Layout_Position',
              type: 'layout',
            },
          },
        },
      },
      edge: {
        knows: {
          name: 'Knows',
          color: 'edge-color-seq-1',
        },
      },
    },
    stages: [
      {
        id: 'nameGenerator1',
        type: 'NameGenerator',
        label: 'Generate Names',
        subject: { entity: 'node', type: 'person' },
        form: {
          title: 'Add person',
          fields: [{ variable: 'personName', prompt: 'Enter name' }],
        },
        prompts: [{ id: 'prompt1', text: 'Who do you know?' }],
      },
      {
        id: 'sociogram1',
        type: 'Sociogram',
        label: 'Sociogram',
        subject: { entity: 'node', type: 'person' },
        background: { concentricCircles: 4 },
        prompts: [
          {
            id: 'socPrompt1',
            text: 'Position nodes',
            layout: { layoutVariable: 'layoutPosition' },
          },
        ],
      },
    ],
    // Branded reference fields make this literal uncastable directly.
  } as unknown as CurrentProtocol;
}

export async function waitForLockWait(db: pg.Pool): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const res = await db.query(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if ((res.rows[0] as { waiting: number }).waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('no backend ever blocked on a lock');
}
