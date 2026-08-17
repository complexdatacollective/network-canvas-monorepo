import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type pg from 'pg';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import {
  createScratchSchema,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { ensureSchema } from '../../db/schema.ts';

/**
 * A Postgres to run the DB-backed protocol suites against, or null. The pure
 * suites (taxonomy, sectionize/assemble round-trips, diff, validate) always
 * run; everything touching real transactions skips without one.
 */
export const storeDb = await reachableDb();

/**
 * An isolated schema carrying the whole Studio schema. Applying it through
 * ensureSchema rather than raw DDL means every DB test exercises the same path
 * boot does.
 */
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

// packages/protocols is a pure-data package with no test runner; its fixtures
// are resolved through its exports map so that changing one invalidates this
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

/** A small, valid schema-8 protocol used by golden-hash, diff, and pg tests
 * (trimmed from protocol-validation's createBaseProtocol). */
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
    // Branded reference fields (EntityAttributeReference) make a literal
    // uncastable directly; the object is schema-valid by construction and
    // the round-trip tests prove it.
  } as unknown as CurrentProtocol;
}
