import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import {
  jsonHash,
  sha256,
  type Migration,
} from '../postgres-migration-artifacts.ts';
import {
  createPostgresMigrator,
  type PostgresMigrationConfig,
} from '../postgres-migrations.ts';

const config: PostgresMigrationConfig = {
  applicationName: 'Registry',
  allowedLoginsSetting: 'REGISTRY_DATABASE_ALLOWED_LOGINS',
  runtimeRoles: ['registry_app', 'registry_operator'],
  runtimeLoginRoleSets: [['registry_app'], ['registry_operator']],
  backupRole: 'registry_backup',
  historySchema: 'registry_migrations',
  schemaName: 'public',
  fingerprintTable: 'registry_schema_fingerprint',
  lockKey: 4021775688147131,
  stampFingerprint: async () => undefined,
};

describe('PostgreSQL migration configuration', () => {
  it('accepts complete registry and quoted-identifier configurations', () => {
    expect(() => createPostgresMigrator(config)).not.toThrow();
    expect(() =>
      createPostgresMigrator({
        ...config,
        historySchema: 'migration"history',
        schemaName: 'schema-with-dash',
        fingerprintTable: "stamp'$tag$",
        runtimeRoles: ['runtime"role', 'opérateur-role'],
        runtimeLoginRoleSets: [['opérateur-role', 'runtime"role']],
      }),
    ).not.toThrow();
  });

  it.each([
    { historySchema: '' },
    { schemaName: 'a'.repeat(64) },
    { fingerprintTable: 'stamp\0table' },
    { fingerprintTable: 'stamp\ud800' },
    { schemaName: 'é'.repeat(32) },
    { runtimeRoles: [] },
    { runtimeRoles: ['registry_app', 'registry_app'] },
    { runtimeRoles: ['role\udfff'] },
    { runtimeLoginRoleSets: [] },
    { runtimeLoginRoleSets: [[]] },
    { runtimeLoginRoleSets: [['registry_app', 'registry_app']] },
    { runtimeLoginRoleSets: [['registry_app']] },
    {
      runtimeLoginRoleSets: [
        ['registry_app'],
        ['registry_app', 'registry_operator'],
      ],
    },
    { runtimeLoginRoleSets: [['registry_app', 'registry_operator', 'other']] },
    {
      runtimeLoginRoleSets: [
        ['registry_app', 'registry_operator', 'registry_backup'],
      ],
    },
    {
      runtimeLoginRoleSets: [
        ['registry_app'],
        ['registry_operator'],
        ['registry_app'],
      ],
    },
    {
      runtimeLoginRoleSets: [
        ['registry_app', 'registry_operator'],
        ['registry_operator', 'registry_app'],
      ],
    },
    { runtimeLoginRoleSets: [['role\udfff']] },
    { backupRole: '' },
    { backupRole: 'registry_app' },
    { backupRole: 'b'.repeat(64) },
    { applicationName: '' },
    { applicationName: 'Registry\nsecret' },
    { allowedLoginsSetting: 'registry' },
    { allowedLoginsSetting: 'REGISTRY\nOTHER' },
    { lockKey: Number.MAX_SAFE_INTEGER + 1 },
    { lockKey: 1.5 },
    { lockKey: Number.NaN },
    { historySchema: 'public' },
    { historySchema: 'public', fingerprintTable: 'history' },
  ] satisfies Partial<PostgresMigrationConfig>[])(
    'refuses invalid configuration before a database can be supplied: %j',
    (invalid) => {
      expect(() => createPostgresMigrator({ ...config, ...invalid })).toThrow();
    },
  );

  it('validates complete migration artifacts before attempting a connection', async () => {
    const sql = 'SELECT 1';
    const sidecars = 'SELECT 2';
    const fingerprint = sha256('registry schema');
    const manifest = {
      format: 1 as const,
      id: '0001_initial',
      previous: null,
      fingerprint,
      snapshotHash: jsonHash({}),
      sqlHash: sha256(sql),
      sidecarsHash: sha256(sidecars),
    };
    const migration: Migration = {
      manifest,
      checksum: jsonHash(manifest),
      snapshot: {},
      sql: `${sql} -- edited`,
      sidecars,
    };
    let connected = false;
    const pool = {
      connect: () => {
        connected = true;
        return Promise.reject(new Error('database connection attempted'));
      },
    } as unknown as pg.Pool;
    await expect(
      createPostgresMigrator(config).migrate(pool, [migration], fingerprint, [
        'registry_owner',
      ]),
    ).rejects.toThrow('checksum mismatch');
    expect(connected).toBe(false);
  });
});
