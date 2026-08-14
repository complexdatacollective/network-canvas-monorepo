import { readFileSync } from 'node:fs';
import path from 'node:path';

import pg from 'pg';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { createStoreDatabase } from '../schema.ts';
import { PGPORT } from './test-env.ts';

/**
 * Whether a Postgres is reachable for the pg-backed suites. The pure suites
 * (taxonomy, sectionize/assemble round-trips, diff) always run.
 */
export const dbAvailable = await (async () => {
  const probe = new pg.Client({
    host: '127.0.0.1',
    port: PGPORT,
    user: 'postgres',
    password: 'spike',
    database: 'postgres',
    connectionTimeoutMillis: 1_500,
  });
  try {
    await probe.connect();
    await probe.end();
    return true;
  } catch {
    console.warn(
      `[studio-protocol-store] Postgres not reachable on 127.0.0.1:${PGPORT} — skipping the pg-backed suites. ` +
        `Start one with: docker run -d -e POSTGRES_PASSWORD=spike -p ${PGPORT}:5432 postgres:18`,
    );
    return false;
  }
})();

export async function makeStoreDb(name: string): Promise<pg.Pool> {
  return createStoreDatabase(PGPORT, name);
}

// packages/protocols is a pure-data package with no test runner; fixtures are
// read by relative path, exactly as protocol-validation's own tests do.
export function readFixtureProtocol(relative: string): CurrentProtocol {
  const fixturePath = path.resolve(
    import.meta.dirname,
    '../../../protocols',
    relative,
  );
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as CurrentProtocol;
}

export const FIXTURES = [
  'e2e/all-interfaces/protocol.json',
  'sample/protocol.json',
  'development/protocol.json',
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
