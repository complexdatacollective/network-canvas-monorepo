import { expect, it } from 'vitest';

import { createPostgresPool } from '@codaco/studio-sync/postgres-pool';

import { createRegistryTestDatabase } from '../__tests__/database.ts';
import { setRegistryPoolBounds } from './pool.ts';
import { REGISTRY_TABLES, registrySidecarSql } from './schema.ts';

it('pins live query budgets and the public schema after hostile URL options, retaining the verified role', async () => {
  const database = await createRegistryTestDatabase(
    REGISTRY_TABLES,
    registrySidecarSql,
  );
  try {
    const url = new URL(database.databaseUrl);
    url.searchParams.set(
      'options',
      '-c statement_timeout=0 -c lock_timeout=0 -c idle_in_transaction_session_timeout=0 -c search_path=pg_catalog',
    );
    url.searchParams.set('statement_timeout', '0');
    url.searchParams.set('query_timeout', '0');
    for (const role of Object.values(database.roles)) {
      const pool = createPostgresPool({
        connectionString: url.toString(),
        role,
        max: 1,
        onIdleError: () => {
          throw new Error('REGISTRY_TEST_IDLE_ERROR');
        },
      });
      setRegistryPoolBounds(pool);
      try {
        const expected = {
          role,
          statement: '15s',
          lock: '10s',
          idle: '20s',
          path: 'public',
        };
        const read = () =>
          pool.query(`SELECT current_user AS role,
          current_setting('statement_timeout') AS statement,
          current_setting('lock_timeout') AS lock,
          current_setting('idle_in_transaction_session_timeout') AS idle,
          current_setting('search_path') AS path`);
        expect((await read()).rows).toEqual([expected]);
        await pool.query('RESET ALL; RESET ROLE');
        expect((await read()).rows).toEqual([expected]);
        expect(() => setRegistryPoolBounds(pool)).toThrow(
          'REGISTRY_POOL_MUST_BE_PARSED_AND_UNOPENED',
        );
      } finally {
        await pool.end();
      }
    }
    const unparsed = createPostgresPool({
      connectionString: url.toString(),
      onIdleError: () => {
        throw new Error('REGISTRY_TEST_IDLE_ERROR');
      },
    });
    try {
      expect(() => setRegistryPoolBounds(unparsed)).toThrow(
        'REGISTRY_POOL_MUST_BE_PARSED_AND_UNOPENED',
      );
    } finally {
      await unparsed.end();
    }
  } finally {
    await database.dispose();
  }
});
