import { fileURLToPath } from 'node:url';

import { escapeIdentifier, escapeLiteral } from 'pg';
import type pg from 'pg';
import { expect, it, vi } from 'vitest';

import { readMigrations } from '@codaco/studio-sync/postgres-migration-artifacts';
import { templateBytesHash } from '@codaco/studio-sync/template-exchange';

import { createRegistryFixture } from './__tests__/fixtures.ts';
import { createRegistryInstallation } from './__tests__/installation.ts';
import { REGISTRY_SCHEMA_FINGERPRINT } from './db/fingerprint.generated.ts';
import { registryMigrator } from './db/migrate.ts';
import {
  createRegistryRecoveryInventory,
  type RegistryRecoveryReconciliation,
} from './recovery-reconciliation.ts';
import { reconcileRegistryRecovery } from './recovery.ts';

type RecoveryQueryEvent = {
  lane: 'owner' | 'backup';
  sql: string;
};

async function registryRecoveryEvidence(
  pool: pg.Pool,
): Promise<RegistryRecoveryReconciliation> {
  const users = await pool.query<{
    id: string;
    email: string;
    email_verified: boolean;
  }>(
    'SELECT id, email, email_verified FROM registry_auth_user ORDER BY id COLLATE "C"',
  );
  const publishers = await pool.query<{
    id: string;
    user_id: string;
    name: string;
    orcid: string | null;
    suspended: boolean;
  }>(
    'SELECT id, user_id, name, orcid, suspended_at IS NOT NULL AS suspended FROM registry_publishers ORDER BY id',
  );
  const operators = await pool.query<{ user_id: string }>(
    'SELECT user_id FROM registry_operators WHERE enabled ORDER BY user_id COLLATE "C"',
  );
  const entries = await pool.query<{
    id: string;
    publisher_id: string;
    artifact_root: string;
    yanked: boolean;
  }>(
    'SELECT id, publisher_id, artifact_root, yanked_at IS NOT NULL AS yanked FROM registry_entries ORDER BY id',
  );
  const artifacts = await pool.query<{
    root: string;
    blocked: boolean;
    deleted: boolean;
  }>(
    'SELECT root,blocked_at IS NOT NULL AS blocked,deleted_at IS NOT NULL AS deleted FROM registry_artifacts ORDER BY root',
  );
  return {
    format: 'template-registry-recovery-reconciliation',
    version: 4,
    inventories: {
      artifacts: createRegistryRecoveryInventory('artifacts', artifacts.rows),
      users: createRegistryRecoveryInventory(
        'users',
        users.rows.map((user) => ({
          id: user.id,
          email: user.email,
          emailVerified: user.email_verified,
        })),
      ),
      publishers: createRegistryRecoveryInventory(
        'publishers',
        publishers.rows.map((publisher) => ({
          id: publisher.id,
          userId: publisher.user_id,
          name: publisher.name,
          orcid: publisher.orcid,
          suspended: publisher.suspended,
        })),
      ),
      operators: createRegistryRecoveryInventory(
        'operators',
        operators.rows.map((operator) => ({ userId: operator.user_id })),
      ),
      entries: createRegistryRecoveryInventory(
        'entries',
        entries.rows.map((entry) => ({
          id: entry.id,
          publisherId: entry.publisher_id,
          artifactRoot: entry.artifact_root,
          yanked: entry.yanked,
        })),
      ),
    },
  };
}

function observeRecoveryPool(
  pool: pg.Pool,
  lane: RecoveryQueryEvent['lane'],
  events: RecoveryQueryEvent[],
): pg.Pool {
  return {
    connect: async () => {
      const client = await pool.connect();
      return {
        query: ((...args: unknown[]) => {
          const sql = args[0];
          if (typeof sql === 'string')
            events.push({ lane, sql: sql.replaceAll(/\s+/g, ' ').trim() });
          return Reflect.apply(client.query, client, args);
        }) as pg.PoolClient['query'],
        release: client.release.bind(client),
      } as pg.PoolClient;
    },
  } as pg.Pool;
}

it('reconciles an isolated restored registry only after schema, backup, and artifact proofs', async () => {
  const installation = await createRegistryInstallation();
  const fixture = await createRegistryFixture({}, installation);
  const migrations = await readMigrations(
    fileURLToPath(new URL('../migrations', import.meta.url)),
    'Template Registry',
  );
  try {
    await registryMigrator.migrate(
      fixture.owner,
      migrations,
      REGISTRY_SCHEMA_FINGERPRINT,
      installation.allowedLogins,
    );
    // Exercise locale-aware ordering independently of JavaScript's UTF-16 sort.
    await fixture.owner
      .query(`CREATE COLLATION recovery_locale (provider = icu, locale = 'und');
      ALTER TABLE registry_publishers ALTER COLUMN user_id TYPE text COLLATE recovery_locale;
      INSERT INTO registry_auth_user(id, name, email, email_verified, updated_at)
      VALUES ('Zulu', 'Zulu', 'zulu@example.test', true, now()),
        ('alpha', 'Alpha', 'alpha@example.test', true, now());
      INSERT INTO registry_publishers(id, user_id, name) VALUES ('00000000-0000-4000-8000-000000000001', 'Zulu', 'Zulu'), ('00000000-0000-4000-8000-000000000002', 'alpha', 'Alpha')`);
    // Cross the recovery page boundary for both authority inventories, under
    // the locale-aware user-id ordering above.
    await fixture.owner
      .query(`INSERT INTO registry_auth_user(id, name, email, email_verified, updated_at)
      SELECT 'page-user-' || value, 'Page user', 'page-' || value || '@example.test', true, now()
      FROM generate_series(1, 65) AS value;
      INSERT INTO registry_publishers(id, user_id, name)
      SELECT gen_random_uuid(), id, name FROM registry_auth_user WHERE id LIKE 'page-user-%'`);
    const account = await fixture.account('restored@example.test', true);
    await fixture.published(account.token, 'Recovered template');
    await fixture.owner.query(
      `INSERT INTO registry_auth_verification(id, identifier, value, expires_at)
       VALUES ('restored-one-time', 'restored@example.test', 'one-time', statement_timestamp() + interval '5 minutes')`,
    );
    await fixture.owner.query('UPDATE registry_operators SET enabled = false');
    await fixture.owner.query(
      `INSERT INTO registry_auth_user(id, name, email, email_verified, updated_at)
       VALUES ('inactive-unverified', 'Inactive', 'inactive@EXAMPLE.TEST', false, statement_timestamp())`,
    );
    const reconciliation = await registryRecoveryEvidence(fixture.owner);
    await installation.closeRuntimePools();
    await installation.withAdministrator(async (administrator) => {
      await administrator.query(
        `ALTER ROLE ${escapeIdentifier(installation.logins.app)} NOLOGIN;
         ALTER ROLE ${escapeIdentifier(installation.logins.operator)} NOLOGIN`,
      );
    });
    const recoveryQueries: RecoveryQueryEvent[] = [];
    await reconcileRegistryRecovery({
      pool: observeRecoveryPool(fixture.owner, 'owner', recoveryQueries),
      backupPool: observeRecoveryPool(
        installation.backupPool,
        'backup',
        recoveryQueries,
      ),
      blobs: fixture.blobs,
      admission: { allowedLogins: installation.allowedLogins },
      reconciliation,
    });

    const inventoryPages = recoveryQueries
      .map((event, index) => ({ event, index }))
      .filter(
        ({ event }) =>
          event.lane === 'owner' &&
          (event.sql.startsWith(
            'SELECT id, email, email_verified FROM registry_auth_user',
          ) ||
            event.sql.startsWith(
              'SELECT id, user_id, name, orcid, suspended_at IS NOT NULL AS suspended FROM registry_publishers',
            ) ||
            event.sql.startsWith(
              'SELECT id, publisher_id, artifact_root, yanked_at IS NOT NULL AS yanked FROM registry_entries',
            ) ||
            event.sql.startsWith(
              'SELECT root, blocked_at IS NOT NULL AS blocked, deleted_at IS NOT NULL AS deleted FROM registry_artifacts',
            )),
      );
    expect(
      inventoryPages.filter(({ event }) =>
        event.sql.includes('registry_auth_user'),
      ),
    ).toHaveLength(2);
    expect(
      inventoryPages.filter(({ event }) =>
        event.sql.includes('registry_publishers'),
      ),
    ).toHaveLength(2);
    expect(
      inventoryPages.filter(({ event }) =>
        event.sql.includes('registry_entries'),
      ),
    ).toHaveLength(1);
    expect(
      inventoryPages.filter(({ event }) =>
        event.sql.includes('FROM registry_artifacts'),
      ),
    ).toHaveLength(1);
    for (const { index } of inventoryPages) {
      expect(recoveryQueries.slice(index + 1, index + 3)).toEqual([
        { lane: 'owner', sql: 'SELECT 1' },
        { lane: 'backup', sql: 'SELECT 1' },
      ]);
    }
    const lockIndex = recoveryQueries.findIndex(({ sql }) =>
      sql.startsWith('LOCK TABLE registry_auth_user'),
    );
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(recoveryQueries.slice(lockIndex + 1, lockIndex + 3)).not.toEqual([
      { lane: 'owner', sql: 'SELECT 1' },
      { lane: 'backup', sql: 'SELECT 1' },
    ]);

    expect(fixture.blobs.ready).toHaveBeenCalledOnce();
    expect(
      (
        await fixture.owner.query(
          "SELECT email, email_verified FROM registry_auth_user WHERE id = 'inactive-unverified'",
        )
      ).rows,
    ).toEqual([{ email: 'inactive@EXAMPLE.TEST', email_verified: false }]);

    expect(
      (
        await fixture.owner.query(`SELECT
          (SELECT count(*)::integer FROM registry_auth_session) AS sessions,
          (SELECT count(*)::integer FROM registry_auth_verification) AS verifications,
          (SELECT count(*)::integer FROM registry_credentials WHERE revoked_at IS NULL) AS credentials,
          (SELECT count(*)::integer FROM registry_operators WHERE enabled) AS operators,
          (SELECT count(*)::integer FROM registry_publishers WHERE suspended_at IS NULL) AS publishers`)
      ).rows,
    ).toEqual([
      {
        sessions: 0,
        verifications: 0,
        credentials: 0,
        operators: 0,
        publishers: 68,
      },
    ]);
  } finally {
    await fixture.dispose();
  }
});

it('refuses swapped publisher UUID ownership before restoring authority', async () => {
  const installation = await createRegistryInstallation();
  const fixture = await createRegistryFixture({}, installation);
  try {
    const migrations = await readMigrations(
      fileURLToPath(new URL('../migrations', import.meta.url)),
      'Template Registry',
    );
    await registryMigrator.migrate(
      fixture.owner,
      migrations,
      REGISTRY_SCHEMA_FINGERPRINT,
      installation.allowedLogins,
    );
    const first = await fixture.account('first@example.test');
    const second = await fixture.account('second@example.test');
    const reconciliation = await registryRecoveryEvidence(fixture.owner);
    // Both sets of IDs remain unchanged, but each account would acquire the
    // other publisher's historical entries after issuing a new credential.
    await fixture.owner.query(
      `INSERT INTO registry_auth_user(id, name, email, email_verified, updated_at)
       VALUES ('swap-temporary', 'Temporary', 'temporary@example.test', true, now())`,
    );
    await fixture.owner.query(
      "UPDATE registry_publishers SET user_id='swap-temporary' WHERE user_id=$1",
      [first.session.userId],
    );
    await fixture.owner.query(
      'UPDATE registry_publishers SET user_id=$1 WHERE user_id=$2',
      [first.session.userId, second.session.userId],
    );
    await fixture.owner.query(
      "UPDATE registry_publishers SET user_id=$1 WHERE user_id='swap-temporary'",
      [second.session.userId],
    );
    await fixture.owner.query(
      "DELETE FROM registry_auth_user WHERE id='swap-temporary'",
    );
    await installation.closeRuntimePools();
    await installation.withAdministrator((administrator) =>
      administrator.query(
        `ALTER ROLE ${escapeIdentifier(installation.logins.app)} NOLOGIN;
       ALTER ROLE ${escapeIdentifier(installation.logins.operator)} NOLOGIN`,
      ),
    );
    await expect(
      reconcileRegistryRecovery({
        pool: fixture.owner,
        backupPool: installation.backupPool,
        blobs: fixture.blobs,
        admission: { allowedLogins: installation.allowedLogins },
        reconciliation,
      }),
    ).rejects.toThrow('REGISTRY_RECOVERY_RECONCILIATION_MISMATCH');
    expect(
      (
        await fixture.owner.query(
          'SELECT count(*)::int AS count FROM registry_credentials WHERE revoked_at IS NULL',
        )
      ).rows,
    ).toEqual([{ count: 2 }]);
  } finally {
    await fixture.dispose();
  }
});

it('refuses restored entries whose publisher ownership was swapped', async () => {
  const installation = await createRegistryInstallation();
  const fixture = await createRegistryFixture({}, installation);
  try {
    const migrations = await readMigrations(
      fileURLToPath(new URL('../migrations', import.meta.url)),
      'Template Registry',
    );
    await registryMigrator.migrate(
      fixture.owner,
      migrations,
      REGISTRY_SCHEMA_FINGERPRINT,
      installation.allowedLogins,
    );
    const first = await fixture.account('entry-first@example.test');
    const second = await fixture.account('entry-second@example.test');
    const firstEntry = await fixture.published(first.token, 'First ownership');
    const secondEntry = await fixture.published(
      second.token,
      'Second ownership',
    );
    const reconciliation = await registryRecoveryEvidence(fixture.owner);
    await fixture.owner.query(
      'UPDATE registry_entries SET publisher_id = $1 WHERE id = $2',
      [second.publisher.id, firstEntry.entry.id],
    );
    await fixture.owner.query(
      'UPDATE registry_entries SET publisher_id = $1 WHERE id = $2',
      [first.publisher.id, secondEntry.entry.id],
    );
    await installation.closeRuntimePools();
    await installation.withAdministrator((administrator) =>
      administrator.query(
        `ALTER ROLE ${escapeIdentifier(installation.logins.app)} NOLOGIN;
         ALTER ROLE ${escapeIdentifier(installation.logins.operator)} NOLOGIN`,
      ),
    );

    await expect(
      reconcileRegistryRecovery({
        pool: fixture.owner,
        backupPool: installation.backupPool,
        blobs: fixture.blobs,
        admission: { allowedLogins: installation.allowedLogins },
        reconciliation,
      }),
    ).rejects.toThrow('REGISTRY_RECOVERY_RECONCILIATION_MISMATCH');
    expect(
      (
        await fixture.owner.query(
          'SELECT count(*)::int AS count FROM registry_credentials WHERE revoked_at IS NULL',
        )
      ).rows,
    ).toEqual([{ count: 2 }]);
  } finally {
    await fixture.dispose();
  }
});

it('refuses restored entries whose artifact roots were swapped within one publisher', async () => {
  const installation = await createRegistryInstallation();
  const fixture = await createRegistryFixture({}, installation);
  try {
    const migrations = await readMigrations(
      fileURLToPath(new URL('../migrations', import.meta.url)),
      'Template Registry',
    );
    await registryMigrator.migrate(
      fixture.owner,
      migrations,
      REGISTRY_SCHEMA_FINGERPRINT,
      installation.allowedLogins,
    );
    const account = await fixture.account('entry-root-swap@example.test');
    const temporary = await fixture.account(
      'entry-root-swap-temp@example.test',
    );
    const first = await fixture.published(account.token, 'First root');
    const second = await fixture.published(account.token, 'Second root');
    const reconciliation = await registryRecoveryEvidence(fixture.owner);
    await fixture.owner.query(
      'UPDATE registry_entries SET publisher_id = $1 WHERE id = $2',
      [temporary.publisher.id, first.entry.id],
    );
    await fixture.owner.query(
      'UPDATE registry_entries SET artifact_root = $1 WHERE id = $2',
      [first.entry.root, second.entry.id],
    );
    await fixture.owner.query(
      'UPDATE registry_entries SET publisher_id = $1, artifact_root = $2 WHERE id = $3',
      [account.publisher.id, second.entry.root, first.entry.id],
    );
    await installation.closeRuntimePools();
    await installation.withAdministrator((administrator) =>
      administrator.query(
        `ALTER ROLE ${escapeIdentifier(installation.logins.app)} NOLOGIN;
         ALTER ROLE ${escapeIdentifier(installation.logins.operator)} NOLOGIN`,
      ),
    );

    await expect(
      reconcileRegistryRecovery({
        pool: fixture.owner,
        backupPool: installation.backupPool,
        blobs: fixture.blobs,
        admission: { allowedLogins: installation.allowedLogins },
        reconciliation,
      }),
    ).rejects.toThrow('REGISTRY_RECOVERY_RECONCILIATION_MISMATCH');
    expect(
      (
        await fixture.owner.query(
          'SELECT count(*)::int AS count FROM registry_credentials WHERE revoked_at IS NULL',
        )
      ).rows,
    ).toEqual([{ count: 2 }]);
  } finally {
    await fixture.dispose();
  }
});

it('requires object-store readiness even when the restored registry has no artifacts', async () => {
  const installation = await createRegistryInstallation();
  const fixture = await createRegistryFixture({}, installation);
  try {
    const migrations = await readMigrations(
      fileURLToPath(new URL('../migrations', import.meta.url)),
      'Template Registry',
    );
    await registryMigrator.migrate(
      fixture.owner,
      migrations,
      REGISTRY_SCHEMA_FINGERPRINT,
      installation.allowedLogins,
    );
    const reconciliation = await registryRecoveryEvidence(fixture.owner);
    await installation.closeRuntimePools();
    await installation.withAdministrator((administrator) =>
      administrator.query(
        `ALTER ROLE ${escapeIdentifier(installation.logins.app)} NOLOGIN;
         ALTER ROLE ${escapeIdentifier(installation.logins.operator)} NOLOGIN`,
      ),
    );
    vi.mocked(fixture.blobs.ready).mockRejectedValueOnce(
      new Error('object store unavailable'),
    );

    await expect(
      reconcileRegistryRecovery({
        pool: fixture.owner,
        backupPool: installation.backupPool,
        blobs: fixture.blobs,
        admission: { allowedLogins: installation.allowedLogins },
        reconciliation,
      }),
    ).rejects.toThrow('object store unavailable');
    expect(fixture.blobs.get).not.toHaveBeenCalled();
  } finally {
    await fixture.dispose();
  }
});

it('rejects restored object bytes for a completed artifact deletion', async () => {
  const installation = await createRegistryInstallation();
  const fixture = await createRegistryFixture({}, installation);
  try {
    const migrations = await readMigrations(
      fileURLToPath(new URL('../migrations', import.meta.url)),
      'Template Registry',
    );
    await registryMigrator.migrate(
      fixture.owner,
      migrations,
      REGISTRY_SCHEMA_FINGERPRINT,
      installation.allowedLogins,
    );
    const publisher = await fixture.account('deleted-bytes@example.test');
    const operator = await fixture.account(
      'deleted-bytes-operator@example.test',
      true,
    );
    const published = await fixture.published(publisher.token);
    expect(
      (
        await fixture.request(
          'DELETE',
          `/moderation/artifacts/${published.entry.root}`,
          undefined,
          operator.bearer,
        )
      ).status,
    ).toBe(202);
    expect(await fixture.store.cleanupDeletedArtifacts()).toBe(1);
    const reconciliation = await registryRecoveryEvidence(fixture.owner);
    await fixture.blobs.put(
      templateBytesHash(published.bytes),
      published.bytes,
    );
    await installation.closeRuntimePools();
    await installation.withAdministrator((administrator) =>
      administrator.query(
        `ALTER ROLE ${escapeIdentifier(installation.logins.app)} NOLOGIN;
         ALTER ROLE ${escapeIdentifier(installation.logins.operator)} NOLOGIN`,
      ),
    );

    await expect(
      reconcileRegistryRecovery({
        pool: fixture.owner,
        backupPool: installation.backupPool,
        blobs: fixture.blobs,
        admission: { allowedLogins: installation.allowedLogins },
        reconciliation,
      }),
    ).rejects.toThrow('REGISTRY_RECOVERY_ARTIFACT_INVALID');
  } finally {
    await fixture.dispose();
  }
});

it.each(['email', 'verification'] as const)(
  'refuses restored user %s drift before restoring publisher authority',
  async (kind) => {
    const installation = await createRegistryInstallation();
    const fixture = await createRegistryFixture({}, installation);
    try {
      const migrations = await readMigrations(
        fileURLToPath(new URL('../migrations', import.meta.url)),
        'Template Registry',
      );
      await registryMigrator.migrate(
        fixture.owner,
        migrations,
        REGISTRY_SCHEMA_FINGERPRINT,
        installation.allowedLogins,
      );
      const account = await fixture.account('approved@example.test');
      await fixture.published(account.token, 'Authority binding');
      const reconciliation = await registryRecoveryEvidence(fixture.owner);
      await fixture.owner.query(
        kind === 'email'
          ? 'UPDATE registry_auth_user SET email = $2 WHERE id = $1'
          : 'UPDATE registry_auth_user SET email_verified = false WHERE id = $1',
        kind === 'email'
          ? [account.session.userId, 'restored-attacker@example.test']
          : [account.session.userId],
      );
      await installation.closeRuntimePools();
      await installation.withAdministrator((administrator) =>
        administrator.query(
          `ALTER ROLE ${escapeIdentifier(installation.logins.app)} NOLOGIN;
           ALTER ROLE ${escapeIdentifier(installation.logins.operator)} NOLOGIN`,
        ),
      );

      await expect(
        reconcileRegistryRecovery({
          pool: fixture.owner,
          backupPool: installation.backupPool,
          blobs: fixture.blobs,
          admission: { allowedLogins: installation.allowedLogins },
          reconciliation,
        }),
      ).rejects.toThrow('REGISTRY_RECOVERY_RECONCILIATION_MISMATCH');
      expect(
        (
          await fixture.owner.query(
            'SELECT count(*)::int AS count FROM registry_credentials WHERE revoked_at IS NULL',
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
    } finally {
      await fixture.dispose();
    }
  },
);

it.each(['unverified publisher', 'suspended operator'] as const)(
  'rejects an independently inventoried %s authority violation',
  async (kind) => {
    const installation = await createRegistryInstallation();
    const fixture = await createRegistryFixture({}, installation);
    try {
      const migrations = await readMigrations(
        fileURLToPath(new URL('../migrations', import.meta.url)),
        'Template Registry',
      );
      await registryMigrator.migrate(
        fixture.owner,
        migrations,
        REGISTRY_SCHEMA_FINGERPRINT,
        installation.allowedLogins,
      );
      const account = await fixture.account(
        'invalid-authority@example.test',
        true,
      );
      await fixture.owner.query(
        kind === 'unverified publisher'
          ? 'UPDATE registry_auth_user SET email_verified = false WHERE id = $1'
          : 'UPDATE registry_publishers SET suspended_at = now() WHERE id = $1',
        [
          kind === 'unverified publisher'
            ? account.session.userId
            : account.publisher.id,
        ],
      );
      const reconciliation = await registryRecoveryEvidence(fixture.owner);
      await installation.closeRuntimePools();
      await installation.withAdministrator((administrator) =>
        administrator.query(
          `ALTER ROLE ${escapeIdentifier(installation.logins.app)} NOLOGIN;
           ALTER ROLE ${escapeIdentifier(installation.logins.operator)} NOLOGIN`,
        ),
      );

      await expect(
        reconcileRegistryRecovery({
          pool: fixture.owner,
          backupPool: installation.backupPool,
          blobs: fixture.blobs,
          admission: { allowedLogins: installation.allowedLogins },
          reconciliation,
        }),
      ).rejects.toThrow('REGISTRY_RECOVERY_RECONCILIATION_MISMATCH');
      expect(
        (
          await fixture.owner.query(
            'SELECT count(*)::int AS count FROM registry_credentials WHERE revoked_at IS NULL',
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
    } finally {
      await fixture.dispose();
    }
  },
);

it.each(['name', 'orcid'] as const)(
  'refuses restored publisher %s drift from independently approved evidence',
  async (kind) => {
    const installation = await createRegistryInstallation();
    const fixture = await createRegistryFixture({}, installation);
    try {
      const migrations = await readMigrations(
        fileURLToPath(new URL('../migrations', import.meta.url)),
        'Template Registry',
      );
      await registryMigrator.migrate(
        fixture.owner,
        migrations,
        REGISTRY_SCHEMA_FINGERPRINT,
        installation.allowedLogins,
      );
      const account = await fixture.account('publisher-profile@example.test');
      const reconciliation = await registryRecoveryEvidence(fixture.owner);
      await fixture.owner.query(
        kind === 'name'
          ? 'UPDATE registry_publishers SET name = $2 WHERE id = $1'
          : 'UPDATE registry_publishers SET orcid = $2 WHERE id = $1',
        [
          account.publisher.id,
          kind === 'name' ? 'Restored attacker' : '0000-0002-1825-0097',
        ],
      );
      await installation.closeRuntimePools();
      await installation.withAdministrator((administrator) =>
        administrator.query(
          `ALTER ROLE ${escapeIdentifier(installation.logins.app)} NOLOGIN;
           ALTER ROLE ${escapeIdentifier(installation.logins.operator)} NOLOGIN`,
        ),
      );

      await expect(
        reconcileRegistryRecovery({
          pool: fixture.owner,
          backupPool: installation.backupPool,
          blobs: fixture.blobs,
          admission: { allowedLogins: installation.allowedLogins },
          reconciliation,
        }),
      ).rejects.toThrow('REGISTRY_RECOVERY_RECONCILIATION_MISMATCH');
    } finally {
      await fixture.dispose();
    }
  },
);

it.each([
  'surviving-session',
  'prepared-transaction',
  'reopened-during-validation',
])('refuses %s and preserves the original credentials', async (kind) => {
  const installation = await createRegistryInstallation();
  const fixture = await createRegistryFixture({}, installation);
  let held: pg.PoolClient | undefined;
  const preparedName = `registry_recovery_${installation.databaseName}`;
  let prepared = false;
  try {
    const migrations = await readMigrations(
      fileURLToPath(new URL('../migrations', import.meta.url)),
      'Template Registry',
    );
    await registryMigrator.migrate(
      fixture.owner,
      migrations,
      REGISTRY_SCHEMA_FINGERPRINT,
      installation.allowedLogins,
    );
    const account = await fixture.account('quarantine@example.test', true);
    await fixture.published(account.token, 'Quarantined template');
    const reconciliation = await registryRecoveryEvidence(fixture.owner);
    await installation.closeRuntimePools();
    await installation.withAdministrator((administrator) =>
      administrator.query(
        `ALTER ROLE ${escapeIdentifier(installation.logins.app)} NOLOGIN; ALTER ROLE ${escapeIdentifier(installation.logins.operator)} NOLOGIN`,
      ),
    );
    if (kind === 'surviving-session') held = await fixture.owner.connect();
    if (kind === 'prepared-transaction') {
      await fixture.owner.query(
        `BEGIN; SELECT 1; PREPARE TRANSACTION ${escapeLiteral(preparedName)}`,
      );
      prepared = true;
    }
    if (kind === 'reopened-during-validation') {
      const get = fixture.blobs.get.bind(fixture.blobs);
      vi.spyOn(fixture.blobs, 'get').mockImplementationOnce(async (hash) => {
        await installation.withAdministrator((administrator) =>
          administrator.query(
            `ALTER ROLE ${escapeIdentifier(installation.logins.app)} LOGIN`,
          ),
        );
        return get(hash);
      });
    }
    await expect(
      reconcileRegistryRecovery({
        pool: fixture.owner,
        backupPool: installation.backupPool,
        blobs: fixture.blobs,
        admission: { allowedLogins: installation.allowedLogins },
        reconciliation,
      }),
    ).rejects.toThrow('REGISTRY_RECOVERY_QUARANTINE_REQUIRED');
    expect(
      (
        await fixture.owner.query(
          'SELECT count(*)::int AS count FROM registry_credentials WHERE revoked_at IS NULL',
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  } finally {
    held?.release();
    if (prepared)
      await fixture.owner.query(
        `ROLLBACK PREPARED ${escapeLiteral(preparedName)}`,
      );
    await fixture.dispose();
  }
});

it('rolls back credential invalidation when restored artifact bytes fail verification', async () => {
  const installation = await createRegistryInstallation();
  const fixture = await createRegistryFixture({}, installation);
  const migrations = await readMigrations(
    fileURLToPath(new URL('../migrations', import.meta.url)),
    'Template Registry',
  );
  try {
    await registryMigrator.migrate(
      fixture.owner,
      migrations,
      REGISTRY_SCHEMA_FINGERPRINT,
      installation.allowedLogins,
    );
    const account = await fixture.account('tampered@example.test');
    const published = await fixture.published(
      account.token,
      'Tampered template',
    );
    const reconciliation = await registryRecoveryEvidence(fixture.owner);
    fixture.objects.set(
      templateBytesHash(published.bytes),
      new Uint8Array([1]),
    );
    await installation.closeRuntimePools();
    await installation.withAdministrator((administrator) =>
      administrator.query(
        `ALTER ROLE ${escapeIdentifier(installation.logins.app)} NOLOGIN;
         ALTER ROLE ${escapeIdentifier(installation.logins.operator)} NOLOGIN`,
      ),
    );

    await expect(
      reconcileRegistryRecovery({
        pool: fixture.owner,
        backupPool: installation.backupPool,
        blobs: fixture.blobs,
        admission: { allowedLogins: installation.allowedLogins },
        reconciliation,
      }),
    ).rejects.toThrow('REGISTRY_RECOVERY_ARTIFACT_INVALID');
    expect(
      (
        await fixture.owner.query(`SELECT
          (SELECT count(*)::integer FROM registry_auth_session) AS sessions,
          (SELECT count(*)::integer FROM registry_credentials WHERE revoked_at IS NULL) AS credentials`)
      ).rows,
    ).toEqual([{ sessions: 1, credentials: 1 }]);
  } finally {
    await fixture.dispose();
  }
});

it('refuses recovery while an enrolled runtime can still reconnect', async () => {
  const installation = await createRegistryInstallation();
  const fixture = await createRegistryFixture({}, installation);
  try {
    const migrations = await readMigrations(
      fileURLToPath(new URL('../migrations', import.meta.url)),
      'Template Registry',
    );
    await registryMigrator.migrate(
      fixture.owner,
      migrations,
      REGISTRY_SCHEMA_FINGERPRINT,
      installation.allowedLogins,
    );
    await fixture.account('still-serving@example.test', true);
    const reconciliation = await registryRecoveryEvidence(fixture.owner);
    await installation.closeRuntimePools();
    await expect(
      reconcileRegistryRecovery({
        pool: fixture.owner,
        backupPool: installation.backupPool,
        blobs: fixture.blobs,
        admission: { allowedLogins: installation.allowedLogins },
        reconciliation,
      }),
    ).rejects.toThrow('REGISTRY_RECOVERY_QUARANTINE_REQUIRED');
    expect(
      (
        await fixture.owner.query(
          'SELECT count(*)::int AS count FROM registry_credentials WHERE revoked_at IS NULL',
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  } finally {
    await fixture.dispose();
  }
});

it.each([
  ['blocked', true],
  ['deleted', true],
  ['withdrawn', true],
  ['blocked', false],
  ['deleted', false],
  ['withdrawn', false],
] as const)(
  'requires current %s moderation state during recovery (older backup: %s)',
  async (state, olderBackup) => {
    const installation = await createRegistryInstallation();
    const fixture = await createRegistryFixture({}, installation);
    try {
      const migrations = await readMigrations(
        fileURLToPath(new URL('../migrations', import.meta.url)),
        'Template Registry',
      );
      await registryMigrator.migrate(
        fixture.owner,
        migrations,
        REGISTRY_SCHEMA_FINGERPRINT,
        installation.allowedLogins,
      );
      const account = await fixture.account('safety@example.test');
      const published = await fixture.published(
        account.token,
        'Safety transition',
      );
      const root = published.artifact.manifest.merkle_root;
      if (state === 'withdrawn') {
        await fixture.owner.query(
          'UPDATE registry_entries SET yanked_at=now() WHERE id=$1',
          [published.entry.id],
        );
      } else if (state === 'deleted') {
        const operator = await fixture.account(
          `safety-operator-${String(olderBackup)}@example.test`,
          true,
        );
        expect(
          (
            await fixture.request(
              'DELETE',
              `/moderation/artifacts/${root}`,
              undefined,
              operator.bearer,
            )
          ).status,
        ).toBe(202);
        expect(await fixture.store.cleanupDeletedArtifacts()).toBe(1);
        await fixture.owner.query(
          'UPDATE registry_credentials SET revoked_at = now() WHERE publisher_id = $1',
          [operator.publisher.id],
        );
      } else {
        await fixture.owner.query(
          'UPDATE registry_artifacts SET blocked_at=now() WHERE root=$1',
          [root],
        );
      }
      // Capture reviewed current facts, then simulate an older database state.
      const reconciliation = await registryRecoveryEvidence(fixture.owner);
      if (olderBackup) {
        await fixture.owner.query(
          'UPDATE registry_entries SET yanked_at=NULL WHERE id=$1',
          [published.entry.id],
        );
        await fixture.owner.query(
          'UPDATE registry_artifacts SET blocked_at=NULL,deleted_at=NULL WHERE root=$1',
          [root],
        );
      }
      await installation.closeRuntimePools();
      await installation.withAdministrator((administrator) =>
        administrator.query(
          `ALTER ROLE ${escapeIdentifier(installation.logins.app)} NOLOGIN; ALTER ROLE ${escapeIdentifier(installation.logins.operator)} NOLOGIN`,
        ),
      );
      const recovery = reconcileRegistryRecovery({
        pool: fixture.owner,
        backupPool: installation.backupPool,
        blobs: fixture.blobs,
        admission: { allowedLogins: installation.allowedLogins },
        reconciliation,
      });
      if (olderBackup)
        await expect(recovery).rejects.toThrow(
          'REGISTRY_RECOVERY_RECONCILIATION_MISMATCH',
        );
      else await expect(recovery).resolves.toBeUndefined();
      expect(
        (
          await fixture.owner.query(
            'SELECT count(*)::int AS count FROM registry_credentials WHERE revoked_at IS NULL',
          )
        ).rows,
      ).toEqual([{ count: olderBackup ? 1 : 0 }]);
    } finally {
      await fixture.dispose();
    }
  },
);
