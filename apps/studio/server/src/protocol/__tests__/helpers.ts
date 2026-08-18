import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type pg from 'pg';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import {
  createScratchSchema,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { ensureSchema } from '../../db/schema.ts';

export const storeDb = await reachableDb();

// Applied through ensureSchema rather than raw DDL, so every DB test exercises
// the same path boot does.
export async function makeStoreSchema(): Promise<{
  db: pg.Pool;
  dispose: () => Promise<void>;
}> {
  if (!storeDb) throw new Error('unreachable: probe guaranteed a database');
  const scratch = await createScratchSchema(storeDb);
  const state = await ensureSchema(scratch.pool);
  if (state.kind !== 'created') {
    await scratch.dispose();
    throw new Error(`scratch schema was not created: ${state.kind}`);
  }
  return { db: scratch.pool, dispose: scratch.dispose };
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
