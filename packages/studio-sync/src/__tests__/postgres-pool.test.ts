import { describe, expect, it, vi } from 'vitest';

import { createPostgresPool } from '../postgres-pool.ts';

const connectionString = 'postgres://pool_test:unused@127.0.0.1:1/pool_test';
const onIdleError = () => undefined;

describe('shared PostgreSQL pool configuration', () => {
  it.each([undefined, 1, 2, 4, 32])(
    'creates a lazy pool with a 10-second connect bound and max %s',
    async (max) => {
      const pool = createPostgresPool({
        connectionString,
        role: 'registry_app',
        max,
        onIdleError,
      });
      try {
        expect(pool.totalCount).toBe(0);
        expect(pool.options.connectionTimeoutMillis).toBe(10_000);
        expect(pool.options.max).toBe(max ?? 10);
      } finally {
        await pool.end();
      }
    },
  );

  it('bounds URL-supplied capacity when explicit max is omitted', async () => {
    const pool = createPostgresPool({
      connectionString: `${connectionString}?max=1000&poolSize=1000`,
      role: 'registry_app',
      onIdleError,
    });
    try {
      expect(pool.options.max).toBe(10);
    } finally {
      await pool.end();
    }
  });

  it.each([
    '',
    'Registry_app',
    '1registry_app',
    'registry app',
    'registry_app -c role=none',
    'registry_app\\',
    'registry_app;RESET ROLE',
    'registry_app\n',
    'r'.repeat(64),
  ])('refuses an unsafe or unsupported role identifier: %s', (role) => {
    expect(() =>
      createPostgresPool({ connectionString, role, onIdleError }),
    ).toThrow('POSTGRES_POOL_INVALID_ROLE');
  });

  it.each([0, -1, 33, 1.5, Number.NaN, Infinity, -Infinity])(
    'refuses an unbounded pool capacity: %s',
    (max) => {
      expect(() =>
        createPostgresPool({ connectionString, max, onIdleError }),
      ).toThrow('POSTGRES_POOL_INVALID_MAX');
    },
  );

  it.each(['', 'lowercase', '1CODE', 'CODE details', 'CODE\n', 'C'.repeat(65)])(
    'refuses arbitrary diagnostic text: %s',
    (roleMismatchCode) => {
      expect(() =>
        createPostgresPool({
          connectionString,
          roleMismatchCode,
          onIdleError,
        }),
      ).toThrow('POSTGRES_POOL_INVALID_ROLE_MISMATCH_CODE');
    },
  );

  it.each([
    ['sslmode=disable', false],
    ['sslmode=verify-full', {}],
    ['sslmode=no-verify', { rejectUnauthorized: false }],
    ['sslmode=require&uselibpqcompat=true', { rejectUnauthorized: false }],
  ])('preserves the driver TLS configuration for %s', async (query, ssl) => {
    const pool = createPostgresPool({
      connectionString: `${connectionString}?${query}`,
      role: 'registry_operator',
      onIdleError,
    });
    try {
      expect(pool.options.ssl).toEqual(ssl);
      expect(pool.options.connectionString).toBeUndefined();
    } finally {
      await pool.end();
    }
  });

  it('keeps owner URLs intact for the driver and retains the connect bound', async () => {
    const url = `${connectionString}?options=-c%20application_name%3Downer_probe`;
    const pool = createPostgresPool({ connectionString: url, onIdleError });
    try {
      expect(pool.options.connectionString).toBe(url);
      expect(pool.options.options).toBeUndefined();
      expect(pool.options.connectionTimeoutMillis).toBe(10_000);
    } finally {
      await pool.end();
    }
  });

  it('passes no exception or client contents to the idle-error callback', async () => {
    const log = vi.fn<() => void>();
    const pool = createPostgresPool({ connectionString, onIdleError: log });
    try {
      pool.emit('error', new Error('private-error-canary'), {
        password: 'private-client-canary',
      });
      expect(log).toHaveBeenCalledExactlyOnceWith();
    } finally {
      await pool.end();
    }
  });
});
