import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign as signBytes,
} from 'node:crypto';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { readMigrations } from '@codaco/studio-sync/postgres-migration-artifacts';
import { canonicalize } from '@codaco/studio-sync/apply';
import { BACKUP_ROLE, TENANT_ROLES } from '@codaco/studio-sync/rls';
import {
  revokeLargeObjectPrivilegesSql,
  runtimeRolesSql,
} from '@codaco/studio-sync/role-bootstrap';

import { enrollMigrationTestDatabase } from '../../__tests__/support/migrations.ts';
import { reachableDb } from '../../__tests__/support/postgres.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { migrateDatabase } from '../../db/migrations/migrate.ts';
import {
  createBackupPool,
  createOwnerPool,
  createPool,
} from '../../db/pool.ts';
import type { DbEnv } from '../../env.ts';
import {
  type StudioRecoveryAuthorizationReconciliation,
  verifyStudioRecoveryAuthorizationEvidence,
} from '../authorization-reconciliation.ts';
import {
  authorizeCurrentStudioRecovery,
  reconcileStudioRecoveryAuthorization,
  studioRecoveryAccountCredentialHash,
} from '../authorization.ts';

const database = await reachableDb();
const FAILURE = 'STUDIO_RECOVERY_AUTHORIZATION_FAILED';
const authority = generateKeyPairSync('ed25519');
const authorityPublicKey = authority.publicKey.export({ format: 'jwk' }).x!;

type Fixture = {
  databaseName: string;
  target: DbEnv;
  administrativeTarget: DbEnv;
  administrator: pg.Pool;
  backup: pg.Pool;
  backupLogin: string;
  allowedLogins: string[];
  ownerLogin: string;
  runtimeLogin: string;
  maintenanceLogin: string;
};

let fixture: Fixture | undefined;

function requireFixture(): Fixture {
  if (!fixture) throw new Error('Recovery authorization fixture is required.');
  return fixture;
}

async function withTargetAdministrator<T>(
  callback: (pool: pg.Pool) => Promise<T>,
): Promise<T> {
  const pool = createOwnerPool(requireFixture().administrativeTarget);
  try {
    return await callback(pool);
  } finally {
    await pool.end();
  }
}

async function closeWriters() {
  const f = requireFixture();
  await f.administrator.query(
    `ALTER ROLE ${pg.escapeIdentifier(f.ownerLogin)} NOLOGIN;
     ALTER ROLE ${pg.escapeIdentifier(f.runtimeLogin)} NOLOGIN;
     ALTER ROLE ${pg.escapeIdentifier(f.maintenanceLogin)} NOLOGIN`,
  );
}

async function run(reconciliation: StudioRecoveryAuthorizationReconciliation) {
  const f = requireFixture();
  await f.administrator.query(
    `ALTER ROLE ${pg.escapeIdentifier(f.ownerLogin)} LOGIN`,
  );
  const owner = createOwnerPool(f.target);
  try {
    return await reconcileStudioRecoveryAuthorization({
      pool: owner,
      backupPool: f.backup,
      policy: {
        allowedLogins: f.allowedLogins,
        administrativeLogins: [f.ownerLogin],
      },
      reconciliation,
      reconciliationSha256: 'a'.repeat(64),
    });
  } finally {
    await owner.end();
    await closeWriters();
  }
}

function signEvidence(reconciliation: StudioRecoveryAuthorizationReconciliation) {
  const bytes = Buffer.from(canonicalize(reconciliation));
  return verifyStudioRecoveryAuthorizationEvidence({
    bytes,
    expectedSha256: createHash('sha256').update(bytes).digest('hex'),
    signature: signBytes(null, bytes, authority.privateKey).toString(
      'base64url',
    ),
    authorityKeyId: 'offline-recovery-2026',
    authorityPublicKey,
  });
}

async function authorize(
  reconciliation: StudioRecoveryAuthorizationReconciliation,
) {
  const f = requireFixture();
  const evidence = signEvidence(reconciliation);
  await f.administrator.query(
    `ALTER ROLE ${pg.escapeIdentifier(f.ownerLogin)} LOGIN`,
  );
  const owner = createOwnerPool(f.target);
  try {
    return await authorizeCurrentStudioRecovery({
      pool: owner,
      backupPool: f.backup,
      policy: {
        allowedLogins: f.allowedLogins,
        administrativeLogins: [f.ownerLogin],
      },
      evidence,
    });
  } finally {
    await owner.end();
    await closeWriters();
  }
}

async function currentEvidence(): Promise<StudioRecoveryAuthorizationReconciliation> {
  return withTargetAdministrator(async (pool) => {
    const instance = (
      await pool.query<{
        name: string;
        initial_owner_user_id: string | null;
        initial_team_id: string | null;
        completed_at: Date;
      }>(`SELECT name, initial_owner_user_id, initial_team_id, completed_at
          FROM studio_instance`)
    ).rows[0]!;
    const account = (
      await pool.query<
        Parameters<typeof studioRecoveryAccountCredentialHash>[0]
      >(
        `SELECT id, "userId" AS user_id, issuer, "accountId" AS account_id,
          "providerId" AS provider_id, password,
          access_token_ciphertext AS access_token, access_token_key_id AS access_key_id,
          access_token_algorithm AS access_algorithm, "accessTokenExpiresAt" AS access_expires_at,
          refresh_token_ciphertext AS refresh_token, refresh_token_key_id AS refresh_key_id,
          refresh_token_algorithm AS refresh_algorithm, "refreshTokenExpiresAt" AS refresh_expires_at,
          id_token_ciphertext AS id_token, id_token_key_id AS id_key_id,
          id_token_algorithm AS id_algorithm, scope FROM account WHERE id = 'current-account'`,
      )
    ).rows[0]!;
    return {
      format: 'studio-recovery-authorization-reconciliation',
      version: 1,
      issuedAt: new Date(Date.now() - 60_000).toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      instance: {
        name: instance.name,
        initialOwnerUserId: instance.initial_owner_user_id,
        initialTeamId: instance.initial_team_id,
        completedAt: instance.completed_at.toISOString(),
      },
      users: [
        {
          id: 'current-user',
          email: 'current@example.com',
          emailVerified: true,
        },
      ],
      eligibleUserIds: ['current-user'],
      accounts: [
        {
          id: account.id,
          userId: account.user_id,
          issuer: account.issuer,
          accountId: account.account_id,
          providerId: account.provider_id,
          credentialSha256: studioRecoveryAccountCredentialHash(account),
        },
      ],
      teams: [{ id: 'current-team', slug: 'current-team' }],
      memberships: [
        {
          id: 'current-membership',
          teamId: 'current-team',
          userId: 'current-user',
          roles: ['owner'],
        },
      ],
      studyGrants: [],
      activeWebhookSubscriptions: [],
      activeScheduleIds: [],
      publishedMessageTemplateIds: [],
    };
  });
}

async function seedRestoredState() {
  await withTargetAdministrator(async (pool) => {
    const auditEventId = randomUUID();
    const auditAlertId = randomUUID();
    await pool.query(`
      INSERT INTO "user" (id, name, email, "emailVerified", "updatedAt") VALUES
        ('current-user', 'Current', 'current@example.com', true, now()),
        ('stale-user', 'Stale', 'stale@example.com', true, now());
      INSERT INTO teams (id, name, slug) VALUES
        ('current-team', 'Current', 'current-team'),
        ('stale-team', 'Stale', 'stale-team');
      INSERT INTO team_members (id, team_id, user_id, role) VALUES
        ('current-membership', 'current-team', 'current-user', 'owner'),
        ('stale-membership', 'stale-team', 'stale-user', 'admin');
      INSERT INTO studio_instance
        (name, initial_owner_user_id, initial_team_id, completed_at)
        VALUES ('Recovery fixture', 'current-user', 'current-team',
          '2026-09-08T00:00:00Z')
        ON CONFLICT (id) DO UPDATE SET name = excluded.name,
          initial_owner_user_id = excluded.initial_owner_user_id,
          initial_team_id = excluded.initial_team_id,
          completed_at = excluded.completed_at;
      INSERT INTO account
        (id, "accountId", "providerId", issuer, "userId", password, "updatedAt") VALUES
        ('current-account', 'current-user', 'credential', 'local:credential',
          'current-user', 'current-password-hash', now()),
        ('stale-account', 'stale-user', 'credential', 'local:credential',
          'stale-user', 'stale-password-hash', now());
      INSERT INTO session
        (id, "expiresAt", token, "updatedAt", "userId")
        VALUES ('restored-session', now() + interval '1 day', 'restored-token',
          now(), 'current-user');
      INSERT INTO verification (id, identifier, value, "expiresAt")
        VALUES ('restored-magic-link', 'current@example.com', 'hashed-secret',
          now() + interval '5 minutes');
      INSERT INTO team_invitations
        (id, team_id, email, role, status, expires_at, inviter_id)
        VALUES ('restored-invitation', 'current-team', 'invitee@example.com',
          'member', 'pending', now() + interval '1 day', 'current-user');
      INSERT INTO team_invitation_deliveries
        (id, invitation_id, team_id, email, role, team_label, inviter_label,
          expires_at, attempt_count)
        VALUES ('00000000-0000-4000-8000-000000000001', 'restored-invitation',
          'current-team', 'invitee@example.com', 'member', 'Current', 'Current',
          now() + interval '1 day', 0);
      INSERT INTO api_tokens
        (id, team_id, name, custodian_user_id, token_prefix, token_hash,
          scope_kind, access_level, includes_pii, created_by_user_id)
        VALUES ('00000000-0000-4000-8000-000000000002', 'current-team',
          'Restored token', 'current-user', 'ncs_live_12345678',
          repeat('a', 64), 'team', 'write', true, 'current-user');
      INSERT INTO webhook_subscriptions
        (id, team_id, url, event_types, secret_ciphertext, secret_key_id,
          secret_algorithm, created_by_user_id)
        VALUES ('00000000-0000-4000-8000-000000000003', 'current-team',
          'https://restored.example.invalid/hook', ARRAY['study.updated'],
          decode(repeat('ab', 29), 'hex'), 'integration-current',
          'aes-256-gcm.v1', 'current-user');
      INSERT INTO webhook_deliveries
        (id, team_id, subscription_id, webhook_id, event_type, payload)
        VALUES ('00000000-0000-4000-8000-000000000004', 'current-team',
          '00000000-0000-4000-8000-000000000003', 'restored-webhook',
          'study.updated', '{}'::jsonb);
      INSERT INTO audit_events
        (id, team_id, team_label, sequence, event_type, event_version,
          category, outcome, actor_kind, actor_label, request_id, details)
        VALUES (${pg.escapeLiteral(auditEventId)}::uuid, 'current-team',
          'Current', (SELECT COALESCE(max(sequence), 0) + 1 FROM audit_events
            WHERE team_id = 'current-team'), 'security.fixture', 1,
          'security', 'succeeded', 'system', 'Studio', gen_random_uuid(),
          '{}'::jsonb);
      INSERT INTO audit_alert_outbox
        (id, team_id, audit_event_id, audit_event_sequence, event_type,
          event_version, alert_policy_key)
        SELECT ${pg.escapeLiteral(auditAlertId)}::uuid, team_id, id, sequence,
          event_type, event_version, 'recovery-fixture'
        FROM audit_events WHERE id = ${pg.escapeLiteral(auditEventId)}::uuid;
      INSERT INTO audit_alert_deliveries
        (id, team_id, alert_id, recipient_user_id, channel)
        VALUES (gen_random_uuid(), 'current-team',
          ${pg.escapeLiteral(auditAlertId)}::uuid, 'current-user', 'email');
    `);
  });
}

beforeAll(async () => {
  if (!database) return;
  const suffix = randomUUID().replaceAll('-', '');
  const databaseName = `studio_test_db_${suffix.slice(0, 12)}`;
  const ownerLogin = `recovery_owner_${suffix}`;
  const backupLogin = `recovery_backup_${suffix}`;
  const runtimeLogin = `recovery_runtime_${suffix}`;
  const maintenanceLogin = `recovery_maintenance_${suffix}`;
  const password = randomBytes(24).toString('hex');
  const loginOptions =
    'LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION';
  const administrator = createOwnerPool(database);
  await administrator.query(runtimeRolesSql([BACKUP_ROLE]));
  await administrator.query(
    `CREATE ROLE ${pg.escapeIdentifier(ownerLogin)} ${loginOptions} PASSWORD ${pg.escapeLiteral(password)};
     CREATE ROLE ${pg.escapeIdentifier(backupLogin)} ${loginOptions} PASSWORD ${pg.escapeLiteral(password)};
     CREATE ROLE ${pg.escapeIdentifier(runtimeLogin)} ${loginOptions} PASSWORD ${pg.escapeLiteral(password)};
     CREATE ROLE ${pg.escapeIdentifier(maintenanceLogin)} ${loginOptions} PASSWORD ${pg.escapeLiteral(password)};
     GRANT ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance}, ${BACKUP_ROLE}
       TO ${pg.escapeIdentifier(ownerLogin)} WITH ADMIN OPTION, INHERIT FALSE, SET TRUE;
     GRANT ${BACKUP_ROLE} TO ${pg.escapeIdentifier(backupLogin)} WITH INHERIT FALSE, SET TRUE;
     GRANT ${TENANT_ROLES.app} TO ${pg.escapeIdentifier(runtimeLogin)} WITH INHERIT FALSE, SET TRUE;
     GRANT ${TENANT_ROLES.maintenance} TO ${pg.escapeIdentifier(maintenanceLogin)} WITH INHERIT FALSE, SET TRUE`,
  );
  await administrator.query(
    `CREATE DATABASE ${pg.escapeIdentifier(databaseName)}
       OWNER ${pg.escapeIdentifier(ownerLogin)} TEMPLATE template0
       LOCALE_PROVIDER icu ICU_LOCALE 'en-US'`,
  );
  const url = new URL(database.url);
  url.pathname = `/${databaseName}`;
  url.username = ownerLogin;
  url.password = password;
  const target = { url: url.toString() };
  const administrativeUrl = new URL(database.url);
  administrativeUrl.pathname = `/${databaseName}`;
  const administrativeTarget = { url: administrativeUrl.toString() };
  const owner = createOwnerPool(target);
  const targetAdministrator = createOwnerPool(administrativeTarget);
  await targetAdministrator.query(revokeLargeObjectPrivilegesSql());
  await targetAdministrator.end();
  await owner.query(
    `REVOKE CONNECT, TEMPORARY ON DATABASE ${pg.escapeIdentifier(databaseName)} FROM PUBLIC`,
  );
  const allowedLogins = await enrollMigrationTestDatabase(owner, database, [
    backupLogin,
    runtimeLogin,
    maintenanceLogin,
  ]);
  await migrateDatabase(
    owner,
    await readMigrations(
      fileURLToPath(new URL('../../../migrations', import.meta.url)),
    ),
    SCHEMA_FINGERPRINT,
    allowedLogins,
  );
  await owner.end();
  const backupUrl = new URL(target.url);
  backupUrl.username = backupLogin;
  backupUrl.password = password;
  fixture = {
    databaseName,
    target,
    administrativeTarget,
    administrator,
    backup: createBackupPool({ url: backupUrl.toString() }),
    backupLogin,
    allowedLogins,
    ownerLogin,
    runtimeLogin,
    maintenanceLogin,
  };
  await closeWriters();
});

beforeEach(async () => {
  if (!fixture) return;
  await withTargetAdministrator(async (pool) => {
    await pool.query(`
      DELETE FROM team_invitation_deliveries;
      DELETE FROM team_invitations;
      DELETE FROM audit_alert_deliveries;
      DELETE FROM audit_alert_outbox;
      DELETE FROM webhook_deliveries;
      DELETE FROM webhook_subscriptions;
      DELETE FROM session;
      DELETE FROM verification;
      DELETE FROM api_tokens;
      DELETE FROM account;
      DELETE FROM team_members;
      DELETE FROM "user";
      DELETE FROM teams;
    `);
  });
  await seedRestoredState();
  await closeWriters();
});

afterAll(async () => {
  if (!fixture) return;
  await fixture.backup.end();
  try {
    await fixture.administrator.query(
      `DROP DATABASE IF EXISTS ${pg.escapeIdentifier(fixture.databaseName)} WITH (FORCE)`,
    );
    await fixture.administrator.query(
      `DROP ROLE IF EXISTS ${pg.escapeIdentifier(fixture.ownerLogin)},
         ${pg.escapeIdentifier(fixture.backupLogin)},
         ${pg.escapeIdentifier(fixture.runtimeLogin)},
         ${pg.escapeIdentifier(fixture.maintenanceLogin)}`,
    );
  } finally {
    await fixture.administrator.end();
  }
});

describe.skipIf(!database)('Studio recovery authorization', () => {
  it('enables only signed current identities and is idempotent under quarantine', async () => {
    const evidence = await currentEvidence();
    await run(evidence);
    const first = await authorize(evidence);
    expect(first).toMatchObject({
      format: 'studio-recovery-current-authorization-receipt',
      authority: { keyId: 'offline-recovery-2026' },
      destination: { database: requireFixture().databaseName },
      eligibleUserIds: ['current-user'],
    });
    await expect(authorize(evidence)).resolves.toMatchObject({
      evidence: { sha256: first.evidence.sha256 },
      eligibleUserIds: ['current-user'],
    });
    await withTargetAdministrator(async (pool) => {
      const state = await pool.query<{
        id: string;
        recovery_disabled: boolean;
      }>('SELECT id, recovery_disabled FROM "user" ORDER BY id');
      expect(state.rows).toEqual([
        { id: 'current-user', recovery_disabled: false },
        { id: 'stale-user', recovery_disabled: true },
      ]);
      await expect(
        pool.query(
          `SELECT rolname, rolcanlogin FROM pg_roles
           WHERE rolname = ANY($1::text[]) ORDER BY rolname`,
          [
            requireFixture().ownerLogin,
            requireFixture().runtimeLogin,
            requireFixture().maintenanceLogin,
          ],
        ),
      ).resolves.toHaveProperty(
        'rows',
        [
          requireFixture().maintenanceLogin,
          requireFixture().ownerLogin,
          requireFixture().runtimeLogin,
        ]
          .toSorted()
          .map((rolname) => ({ rolname, rolcanlogin: false })),
      );
      await expect(
        pool.query("SELECT count(*)::int AS count FROM teams WHERE id = 'stale-team'"),
      ).resolves.toHaveProperty('rows', [{ count: 1 }]);
    });
  });

  it('refuses changed authority after revocation without enabling a user', async () => {
    const evidence = await currentEvidence();
    await run(evidence);
    await withTargetAdministrator((pool) =>
      pool.query(
        `INSERT INTO team_members (id, team_id, user_id, role)
         VALUES ('late-membership', 'stale-team', 'stale-user', 'admin')`,
      ),
    );
    await expect(authorize(evidence)).rejects.toThrow(FAILURE);
    await withTargetAdministrator(async (pool) => {
      await expect(
        pool.query(
          'SELECT count(*)::int AS count FROM "user" WHERE NOT recovery_disabled',
        ),
      ).resolves.toHaveProperty('rows', [{ count: 0 }]);
      await expect(
        pool.query(
          "SELECT count(*)::int AS count FROM team_members WHERE id = 'late-membership'",
        ),
      ).resolves.toHaveProperty('rows', [{ count: 1 }]);
    });
  });

  it('refuses a surviving runtime session before current-user authorization', async () => {
    const f = requireFixture();
    const evidence = await currentEvidence();
    await run(evidence);
    await f.administrator.query(
      `ALTER ROLE ${pg.escapeIdentifier(f.runtimeLogin)} LOGIN`,
    );
    const url = new URL(f.target.url);
    url.username = f.runtimeLogin;
    url.password = new URL(f.target.url).password;
    const writer = createPool({ url: url.toString() });
    const connection = await writer.connect();
    await f.administrator.query(
      `ALTER ROLE ${pg.escapeIdentifier(f.runtimeLogin)} NOLOGIN`,
    );
    try {
      await expect(authorize(evidence)).rejects.toThrow(FAILURE);
    } finally {
      connection.release();
      await writer.end();
    }
    await withTargetAdministrator(async (pool) => {
      await expect(
        pool.query(
          'SELECT count(*)::int AS count FROM "user" WHERE NOT recovery_disabled',
        ),
      ).resolves.toHaveProperty('rows', [{ count: 0 }]);
    });
  });

  it('refuses expired, wrong-instance and extra-enabled evidence atomically', async () => {
    const evidence = await currentEvidence();
    await run(evidence);
    const expired = {
      ...evidence,
      issuedAt: '2026-09-07T00:00:00.000Z',
      expiresAt: '2026-09-07T01:00:00.000Z',
    };
    await expect(authorize(expired)).rejects.toThrow(FAILURE);
    await expect(
      authorize({
        ...evidence,
        instance: { ...evidence.instance, name: 'Another Studio' },
      }),
    ).rejects.toThrow(FAILURE);
    await withTargetAdministrator((pool) =>
      pool.query(
        "UPDATE \"user\" SET recovery_disabled = false WHERE id = 'stale-user'",
      ),
    );
    await expect(authorize(evidence)).rejects.toThrow(FAILURE);
    await withTargetAdministrator(async (pool) => {
      await expect(
        pool.query(
          'SELECT id FROM "user" WHERE NOT recovery_disabled ORDER BY id',
        ),
      ).resolves.toHaveProperty('rows', [{ id: 'stale-user' }]);
    });
  });

  it('atomically revokes stale authority and holds restored credentials and delivery', async () => {
    const evidence = await currentEvidence();
    const receipt = await run(evidence);
    expect(receipt).toMatchObject({
      format: 'studio-recovery-authorization-receipt',
      reconciliationSha256: 'a'.repeat(64),
      destination: { database: requireFixture().databaseName },
    });
    await withTargetAdministrator(async (pool) => {
      const state = await pool.query<{
        enabled_users: number;
        sessions: number;
        verifications: number;
        accounts: number;
        memberships: number;
        tokens: number;
        pending_invitations: number;
        uncertain_deliveries: number;
        uncertain_webhooks: number;
        uncertain_audit_outbox: number;
        uncertain_audit_deliveries: number;
        deletion_audits: number;
      }>(`SELECT
        (SELECT count(*)::int FROM "user" WHERE NOT recovery_disabled) enabled_users,
        (SELECT count(*)::int FROM session) sessions,
        (SELECT count(*)::int FROM verification) verifications,
        (SELECT count(*)::int FROM account) accounts,
        (SELECT count(*)::int FROM team_members) memberships,
        (SELECT count(*)::int FROM api_tokens WHERE revoked_at IS NULL) tokens,
        (SELECT count(*)::int FROM team_invitations WHERE status = 'pending') pending_invitations,
        (SELECT count(*)::int FROM team_invitation_deliveries WHERE uncertain_at IS NOT NULL) uncertain_deliveries,
        (SELECT count(*)::int FROM webhook_deliveries WHERE uncertain_at IS NOT NULL) uncertain_webhooks,
        (SELECT count(*)::int FROM audit_alert_outbox WHERE uncertain_at IS NOT NULL) uncertain_audit_outbox,
        (SELECT count(*)::int FROM audit_alert_deliveries WHERE uncertain_at IS NOT NULL) uncertain_audit_deliveries,
        (SELECT count(*)::int FROM credential_audit_events WHERE account_id = 'stale-account') deletion_audits`);
      expect(state.rows[0]).toEqual({
        enabled_users: 0,
        sessions: 0,
        verifications: 0,
        accounts: 1,
        memberships: 1,
        tokens: 0,
        pending_invitations: 0,
        uncertain_deliveries: 1,
        uncertain_webhooks: 1,
        uncertain_audit_outbox: 1,
        uncertain_audit_deliveries: 1,
        deletion_audits: 1,
      });
    });
    await expect(run(evidence)).resolves.toMatchObject({
      reconciliationSha256: 'a'.repeat(64),
    });
  });

  it('rolls every invalidation back when required current authority is absent', async () => {
    const evidence = await currentEvidence();
    evidence.accounts.push({
      ...evidence.accounts[0]!,
      id: 'missing-current-account',
      accountId: 'missing-current-account',
    });
    await expect(run(evidence)).rejects.toThrow(FAILURE);
    await withTargetAdministrator(async (pool) => {
      const state = await pool.query<{
        sessions: number;
        pending: number;
        active_tokens: number;
        stale_accounts: number;
      }>(`SELECT
        (SELECT count(*)::int FROM session) sessions,
        (SELECT count(*)::int FROM team_invitations WHERE status = 'pending') pending,
        (SELECT count(*)::int FROM api_tokens WHERE revoked_at IS NULL) active_tokens,
        (SELECT count(*)::int FROM account WHERE id = 'stale-account') stale_accounts`);
      expect(state.rows[0]).toEqual({
        sessions: 1,
        pending: 1,
        active_tokens: 1,
        stale_accounts: 1,
      });
    });
  });

  it('refuses a surviving runtime session before changing restored state', async () => {
    const f = requireFixture();
    const evidence = await currentEvidence();
    await f.administrator.query(
      `ALTER ROLE ${pg.escapeIdentifier(f.runtimeLogin)} LOGIN`,
    );
    const url = new URL(f.target.url);
    url.username = f.runtimeLogin;
    const ownerPassword = new URL(f.target.url).password;
    url.password = ownerPassword;
    const writer = createPool({ url: url.toString() });
    const connection = await writer.connect();
    await f.administrator.query(
      `ALTER ROLE ${pg.escapeIdentifier(f.runtimeLogin)} NOLOGIN`,
    );
    try {
      await expect(run(evidence)).rejects.toThrow(FAILURE);
    } finally {
      connection.release();
      await writer.end();
    }
    await withTargetAdministrator(async (pool) => {
      await expect(
        pool.query('SELECT count(*)::int AS n FROM session'),
      ).resolves.toHaveProperty('rows', [{ n: 1 }]);
    });
  });
});
