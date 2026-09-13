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
import { reconcileRegistryRecovery } from './recovery.ts';

type RecoveryQueryEvent = {
  lane: 'owner' | 'backup';
  sql: string;
};

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
    const pagedUsers = await fixture.owner.query<{
      id: string;
      email: string;
      publisher_id: string;
    }>(
      `SELECT u.id, u.email, p.id AS publisher_id FROM registry_auth_user u
       JOIN registry_publishers p ON p.user_id = u.id WHERE u.id LIKE 'page-user-%'`,
    );
    const account = await fixture.account('restored@example.test', true);
    const recovered = await fixture.published(
      account.token,
      'Recovered template',
    );
    await fixture.owner.query(
      `INSERT INTO registry_auth_verification(id, identifier, value, expires_at)
       VALUES ('restored-one-time', 'restored@example.test', 'one-time', statement_timestamp() + interval '5 minutes')`,
    );
    await fixture.owner.query(
      `INSERT INTO registry_auth_user(id, name, email, email_verified, updated_at)
       VALUES ('inactive-unverified', 'Inactive', 'inactive@EXAMPLE.TEST', false, statement_timestamp())`,
    );
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
      reconciliation: {
        format: 'template-registry-recovery-reconciliation',
        version: 2,
        users: [
          ...pagedUsers.rows.map((user) => ({
            id: user.id,
            email: user.email,
            emailVerified: true,
            publisher: 'active' as const,
            publisherId: user.publisher_id,
            operator: false,
          })),
          {
            id: 'Zulu',
            email: 'zulu@example.test',
            emailVerified: true,
            publisher: 'active',
            publisherId: '00000000-0000-4000-8000-000000000001',
            operator: false,
          },
          {
            id: 'alpha',
            email: 'alpha@example.test',
            emailVerified: true,
            publisher: 'active',
            publisherId: '00000000-0000-4000-8000-000000000002',
            operator: false,
          },
          {
            id: account.session.userId,
            email: 'restored@example.test',
            emailVerified: true,
            publisher: 'active',
            publisherId: account.publisher.id,
            operator: false,
          },
          {
            id: 'inactive-unverified',
            email: 'inactive@example.test',
            emailVerified: false,
            publisher: 'none',
            publisherId: null,
            operator: false,
          },
        ],
        entries: [
          {
            id: recovered.entry.id,
            publisherId: account.publisher.id,
          },
        ],
      },
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
              'SELECT id, user_id FROM registry_publishers',
            ) ||
            event.sql.startsWith(
              'SELECT id, publisher_id FROM registry_entries',
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
    const reconciliation = {
      format: 'template-registry-recovery-reconciliation' as const,
      version: 2 as const,
      users: [first, second].map((account, index) => ({
        id: account.session.userId,
        email: index === 0 ? 'first@example.test' : 'second@example.test',
        emailVerified: true,
        publisher: 'active' as const,
        publisherId: account.publisher.id,
        operator: false,
      })),
      entries: [],
    };
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
    const reconciliation = {
      format: 'template-registry-recovery-reconciliation' as const,
      version: 2 as const,
      users: [first, second].map((account) => ({
        id: account.session.userId,
        email: account.session.email,
        emailVerified: true,
        publisher: 'active' as const,
        publisherId: account.publisher.id,
        operator: false,
      })),
      entries: [
        { id: firstEntry.entry.id, publisherId: first.publisher.id },
        { id: secondEntry.entry.id, publisherId: second.publisher.id },
      ],
    };
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
        reconciliation: {
          format: 'template-registry-recovery-reconciliation',
          version: 2,
          users: [],
          entries: [],
        },
      }),
    ).rejects.toThrow('object store unavailable');
    expect(fixture.blobs.get).not.toHaveBeenCalled();
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
      const published = await fixture.published(
        account.token,
        'Authority binding',
      );
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
          reconciliation: {
            format: 'template-registry-recovery-reconciliation',
            version: 2,
            users: [
              {
                id: account.session.userId,
                email: 'approved@EXAMPLE.TEST',
                emailVerified: true,
                publisher: 'active',
                publisherId: account.publisher.id,
                operator: false,
              },
            ],
            entries: [
              {
                id: published.entry.id,
                publisherId: account.publisher.id,
              },
            ],
          },
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
    const published = await fixture.published(
      account.token,
      'Quarantined template',
    );
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
        reconciliation: {
          format: 'template-registry-recovery-reconciliation',
          version: 2,
          users: [
            {
              id: account.session.userId,
              email: 'quarantine@example.test',
              emailVerified: true,
              publisher: 'active',
              publisherId: account.publisher.id,
              operator: false,
            },
          ],
          entries: [
            {
              id: published.entry.id,
              publisherId: account.publisher.id,
            },
          ],
        },
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
        reconciliation: {
          format: 'template-registry-recovery-reconciliation',
          version: 2,
          users: [
            {
              id: account.session.userId,
              email: 'tampered@example.test',
              emailVerified: true,
              publisher: 'active',
              publisherId: account.publisher.id,
              operator: false,
            },
          ],
          entries: [
            {
              id: published.entry.id,
              publisherId: account.publisher.id,
            },
          ],
        },
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
    const account = await fixture.account('still-serving@example.test', true);
    await installation.closeRuntimePools();
    await expect(
      reconcileRegistryRecovery({
        pool: fixture.owner,
        backupPool: installation.backupPool,
        blobs: fixture.blobs,
        admission: { allowedLogins: installation.allowedLogins },
        reconciliation: {
          format: 'template-registry-recovery-reconciliation',
          version: 2,
          users: [
            {
              id: account.session.userId,
              email: 'still-serving@example.test',
              emailVerified: true,
              publisher: 'active',
              publisherId: account.publisher.id,
              operator: false,
            },
          ],
          entries: [],
        },
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
