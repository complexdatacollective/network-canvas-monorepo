import { randomUUID } from 'node:crypto';

import { escapeIdentifier, type Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assertSafePostgresMigrationEvidence } from '../postgres-migration-evidence.ts';
import { fixturePool, closeFixturePool } from './support/pool-lifecycle.ts';
import { CI, PGPASSWORD, PGPORT, PGUSER } from './test-env.ts';

const suffix = randomUUID().replaceAll('-', '');
const database = `evidence_acl_${suffix}`;
const roles = {
  runtime: `evidence_runtime_${suffix}`,
  inherited: `evidence_inherited_${suffix}`,
};
const connection = {
  host: '127.0.0.1',
  port: PGPORT,
  user: PGUSER,
  password: PGPASSWORD,
  database: 'postgres',
  max: 1,
  connectionTimeoutMillis: 1500,
};
const administrator = fixturePool(connection);
let reachable = false;
try {
  await administrator.query('SELECT 1');
  reachable = true;
} catch {
  await closeFixturePool(administrator);
  if (CI)
    throw new Error('PostgreSQL is required for migration evidence tests.');
}
const relations = {
  history: { schema: 'evidence', name: 'history' },
  fingerprint: { schema: 'evidence', name: 'fingerprint' },
};

describe.skipIf(!reachable)(
  'PostgreSQL migration evidence ACL boundary',
  () => {
    let pool: Pool;
    beforeAll(async () => {
      for (const role of Object.values(roles))
        await administrator.query(
          `CREATE ROLE ${escapeIdentifier(role)} NOLOGIN`,
        );
      await administrator.query(
        `CREATE DATABASE ${escapeIdentifier(database)} TEMPLATE template0`,
      );
      pool = fixturePool({ ...connection, database });
      await pool.query(`CREATE SCHEMA evidence;
      CREATE TABLE evidence.history (id integer PRIMARY KEY, fingerprint text);
      CREATE TABLE evidence.fingerprint (id integer PRIMARY KEY, fingerprint text);
      INSERT INTO evidence.fingerprint VALUES (1, 'old');
      INSERT INTO evidence.history VALUES (1, 'old');
      GRANT USAGE ON SCHEMA evidence TO ${escapeIdentifier(roles.runtime)}, ${escapeIdentifier(roles.inherited)};
      GRANT SELECT ON ALL TABLES IN SCHEMA evidence TO ${escapeIdentifier(roles.runtime)}`);
    });
    afterAll(async () => {
      await closeFixturePool(pool);
      await administrator.query(
        `DROP DATABASE ${escapeIdentifier(database)} WITH (FORCE)`,
      );
      await administrator.query(
        `DROP ROLE ${Object.values(roles).map(escapeIdentifier).join(', ')}`,
      );
      await closeFixturePool(administrator);
    });

    it('permits administrator writes and runtime reads on standalone evidence', async () => {
      await expect(
        assertSafePostgresMigrationEvidence(pool, relations, [roles.runtime]),
      ).resolves.toBeUndefined();
      const client = await pool.connect();
      try {
        await client.query(`SET ROLE ${escapeIdentifier(roles.runtime)}`);
        expect(
          (await client.query('SELECT fingerprint FROM evidence.fingerprint'))
            .rows,
        ).toEqual([{ fingerprint: 'old' }]);
        await expect(
          client.query(
            "UPDATE evidence.fingerprint SET fingerprint = 'forged'",
          ),
        ).rejects.toThrow('permission denied');
      } finally {
        await client.query('RESET ROLE');
        client.release();
      }
    });

    it.each(
      ['history', 'fingerprint'].flatMap((table) =>
        ['table', 'column', 'inherited', 'set-only', 'public'].map((grant) => ({
          table,
          grant,
        })),
      ),
    )('refuses $grant writes on $table', async ({ table, grant }) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const target =
          grant === 'public'
            ? 'PUBLIC'
            : escapeIdentifier(
                grant === 'inherited' || grant === 'set-only'
                  ? roles.inherited
                  : roles.runtime,
              );
        await client.query(
          `GRANT UPDATE${grant === 'column' ? '(fingerprint)' : ''} ON evidence.${table} TO ${target}`,
        );
        if (grant === 'inherited' || grant === 'set-only')
          await client.query(
            `GRANT ${escapeIdentifier(roles.inherited)} TO ${escapeIdentifier(roles.runtime)} WITH INHERIT ${grant === 'inherited' ? 'TRUE' : 'FALSE'}, SET TRUE`,
          );
        await client.query(
          `SET LOCAL ROLE ${escapeIdentifier(grant === 'set-only' ? roles.inherited : roles.runtime)}`,
        );
        expect(
          (
            await client.query(
              `UPDATE evidence.${table} SET fingerprint = 'forged'`,
            )
          ).rowCount,
        ).toBe(1);
        await expect(
          assertSafePostgresMigrationEvidence(client, relations, [
            roles.runtime,
          ]),
        ).rejects.toThrow('POSTGRES_MIGRATION_EVIDENCE_UNSAFE');
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });

    it.each(['history', 'fingerprint'])(
      'never exempts a protected role after %s ownership drifts to it',
      async (table) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(
            `ALTER TABLE evidence.${table} OWNER TO ${escapeIdentifier(roles.runtime)}`,
          );
          await client.query(
            `SET LOCAL ROLE ${escapeIdentifier(roles.runtime)}`,
          );
          expect(
            (
              await client.query(
                `UPDATE evidence.${table} SET fingerprint = 'forged'`,
              )
            ).rowCount,
          ).toBe(1);
          await expect(
            assertSafePostgresMigrationEvidence(client, relations, [
              roles.runtime,
            ]),
          ).rejects.toThrow('POSTGRES_MIGRATION_EVIDENCE_UNSAFE');
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
      },
    );
  },
);
