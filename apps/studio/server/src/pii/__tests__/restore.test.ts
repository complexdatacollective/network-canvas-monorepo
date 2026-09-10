import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { expect, it } from 'vitest';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchDatabase,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { createBetterAuthInstance } from '../../auth/better-auth.ts';
import { createMaintenancePool, createPool } from '../../db/pool.ts';
import { checkSchema } from '../../db/schema.ts';
import { readEnv } from '../../env.ts';
import { createContactBlindIndex } from '../contacts.ts';
import { EncryptionStartupError, initializeEncryption } from '../initialize.ts';
import { rotateEncryptionBatch } from '../maintenance.ts';
import {
  readParticipantPiiField,
  updateParticipantPii,
} from '../participants.ts';
import { createDataProtection, ProtectedDataError } from '../protection.ts';
import { isContactSuppressed } from '../suppression.ts';
import { readWebhookSecret } from '../webhooks.ts';
import { configuration, rootOne } from './fixtures.ts';
import { participantFixture } from './integration-fixture.ts';

const database = await reachableDb();
const env = readEnv();
const name = 'PRIVATE_RESTORE_NAME_CANARY';
const email = 'private-restore-canary@example.org';
const attributes = 'PRIVATE_RESTORE_ATTRIBUTES_CANARY';
const oauthToken = 'PRIVATE_RESTORE_OAUTH_TOKEN_CANARY';
const secret = Buffer.from('PRIVATE_RESTORE_WEBHOOK_SECRET_CANARY');

// The repository's local and CI services both expose postgres:18 on the
// resolved local port. Use that server's matching pg_dump/psql clients. The
// source is one random test schema; the destination is a fresh random DB.
function postgresContainer() {
  if (!database) throw new Error('A local database is required.');
  const url = new URL(database.url);
  const port = url.searchParams.getAll('port').at(-1) ?? (url.port || '5432');
  const result = spawnSync(
    'docker',
    [
      'ps',
      '--filter',
      `publish=${port}`,
      '--filter',
      'ancestor=postgres:18',
      '--format',
      '{{.Names}}',
    ],
    { encoding: 'utf8', timeout: 10_000 },
  );
  const names = result.stdout?.trim().split('\n') ?? [];
  if (
    result.status !== 0 ||
    names.length !== 1 ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(names[0]!)
  )
    throw new Error(
      'The encryption restore test requires the repository postgres:18 Docker service.',
    );
  return {
    container: names[0]!,
    user: decodeURIComponent(url.username),
    sourceDatabase: decodeURIComponent(url.pathname.slice(1)),
  };
}

function postgresCommand(container: string, command: string[], input?: string) {
  const result = spawnSync('docker', ['exec', '-i', container, ...command], {
    input,
    encoding: 'utf8',
    timeout: 15_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error('The isolated PostgreSQL backup/restore command failed.');
  return result.stdout;
}

it('restores a real pre-rotation pg_dump with retained keys and refuses missing IDs or wrong historical roots', async () => {
  if (!database || !env.auth)
    throw new Error('Local database and auth configuration required.');
  const authEnv = env.auth;
  const client = postgresContainer();
  await participantFixture(async ({ scratch, keys, context, target }) => {
    await updateParticipantPii(keys, context, target, {
      name,
      email,
      phone: '+13125550991',
      attributes: { sensitive: attributes },
    });
    const auth = createBetterAuthInstance(
      authEnv,
      scratch.app,
      { sendMagicLink: async () => undefined },
      { encryptionKeys: keys, deploymentMode: 'managed' },
    );
    await (
      await auth.$context
    ).internalAdapter.createAccount({
      userId: context.principal.userId,
      accountId: 'restore-external-id',
      providerId: 'google',
      issuer: 'https://accounts.google.com',
      accessToken: oauthToken,
      refreshToken: `${oauthToken}-refresh`,
      idToken: `${oauthToken}-id`,
    });
    const subscriptionId = randomUUID();
    const protection = createDataProtection(keys, {
      participant: async () => {
        throw new ProtectedDataError();
      },
      integration: async () => {
        throw new ProtectedDataError();
      },
    });
    const sealed = protection.encryptIntegration(
      {
        kind: 'webhook',
        teamId: context.tenantDb.teamId,
        subscriptionId,
        column: 'secret_ciphertext',
      },
      secret,
    );
    await scratch.pool.query(
      "INSERT INTO webhook_subscriptions (id, team_id, url, event_types, secret_ciphertext, secret_key_id, secret_algorithm, created_by_user_id) VALUES ($1, $2, 'https://hooks.example.org/restore', ARRAY['interview.completed'], $3, $4, $5, $6)",
      [
        subscriptionId,
        context.tenantDb.teamId,
        sealed.envelope,
        sealed.keyId,
        sealed.algorithm,
        context.principal.userId,
      ],
    );
    const index = createContactBlindIndex(keys, {
      kind: 'email',
      value: email,
    });
    await scratch.maintenance.query(
      "INSERT INTO participant_contact_optouts (channel, recipient_blind_index, blind_index_key_id, source) VALUES ('email', $1, $2, 'provider')",
      [index.value, index.keyId],
    );
    const schema = (
      await scratch.pool.query<{ name: string }>(
        'SELECT current_schema() AS name',
      )
    ).rows[0]!.name;
    expect(schema).toMatch(/^studio_test_[a-f0-9]{12}$/);
    const dump = postgresCommand(client.container, [
      'pg_dump',
      '--no-owner',
      '--schema',
      schema,
      '--username',
      client.user,
      '--dbname',
      client.sourceDatabase,
    ]);
    expect(
      dump.includes(target.participantId),
      'the dump must contain the actual protected row',
    ).toBe(true);
    for (const canary of [
      name,
      email,
      '+13125550991',
      attributes,
      oauthToken,
      secret.toString(),
    ]) {
      expect(
        dump.includes(canary),
        'database-only dump leaked protected material',
      ).toBe(false);
      expect(
        dump.includes(Buffer.from(canary).toString('hex')),
        'hex encoding in bytea is not encryption',
      ).toBe(false);
    }
    expect(
      dump.includes(rootOne.toString('hex')),
      'database-only dump leaked root bytes',
    ).toBe(false);

    const rotatedConfiguration = configuration();
    rotatedConfiguration.roots.push({
      id: 'root-3',
      reference: 'TEST_ROOT_THREE',
    });
    rotatedConfiguration.pii.current = 'v3';
    rotatedConfiguration.pii.keys.push({ id: 'v3', rootId: 'root-3' });
    rotatedConfiguration.integration.current = 'v3';
    rotatedConfiguration.integration.keys.push({ id: 'v3', rootId: 'root-3' });
    const rootThree = Buffer.alloc(32, 197);
    const loadRootKey = async (reference: string) =>
      reference === 'TEST_ROOT_THREE' ? rootThree : rootOne;
    const rotated = await initializeEncryption({
      maintenancePool: scratch.maintenance,
      configuration: rotatedConfiguration,
      loadRootKey,
    });
    await expect(
      rotateEncryptionBatch(scratch.maintenance, rotated, { limit: 100 }),
    ).resolves.toEqual({
      processed: 3,
      scanned: 3,
      passComplete: true,
      cursor: null,
    });
    expect(
      (
        await scratch.pool.query(
          'SELECT pii_key_id FROM participants WHERE id = $1',
          [target.participantId],
        )
      ).rows,
    ).toEqual([{ pii_key_id: 'v3' }]);

    const restored = await createScratchDatabase(database);
    const scopedUrl = new URL(restored.db.url);
    scopedUrl.searchParams.set('options', `-c search_path=${schema}`);
    const restoredDb = { url: scopedUrl.toString() };
    const app = createPool(restoredDb);
    const maintenance = createMaintenancePool(restoredDb);
    try {
      const destination = new URL(restored.db.url).pathname.slice(1);
      expect(destination).toMatch(/^studio_test_db_[a-f0-9]{12}$/);
      postgresCommand(
        client.container,
        [
          'psql',
          '--no-psqlrc',
          '--quiet',
          '--set',
          'ON_ERROR_STOP=1',
          '--single-transaction',
          '--username',
          client.user,
          '--dbname',
          destination,
        ],
        dump,
      );
      // This local encryption drill restores a dev-applied schema-only dump.
      // It has neither deployment enrollment nor versioned history. Production
      // refuses that evidence before trusting the otherwise current fingerprint.
      expect(
        (
          await maintenance.query(
            "SELECT to_regclass('studio_migrations.history') IS NULL AS unversioned",
          )
        ).rows,
      ).toEqual([{ unversioned: true }]);
      expect(await checkSchema(app)).toEqual({
        kind: 'stale',
        reason: 'unsafe-evidence',
        found: null,
        appliedAt: null,
      });
      expect(await checkSchema(app, { allowUnversioned: true })).toEqual({
        kind: 'current',
      });
      expect(
        (
          await maintenance.query(
            'SELECT pii_key_id FROM participants WHERE id = $1',
            [target.participantId],
          )
        ).rows,
      ).toEqual([{ pii_key_id: 'v1' }]);
      const recovered = await initializeEncryption({
        maintenancePool: maintenance,
        configuration: rotatedConfiguration,
        loadRootKey,
      });
      const recoveredContext = {
        ...context,
        tenantDb: createTenantDb(app, context.tenantDb.teamId),
        requestId: randomUUID(),
      };
      expect(
        (
          await readParticipantPiiField(recovered, recoveredContext, {
            ...target,
            column: 'email_ciphertext',
          })
        )?.toString(),
      ).toBe(email);
      expect(
        await readWebhookSecret(recovered, subscriptionId, {
          kind: 'rotation',
          maintenancePool: maintenance,
          teamId: context.tenantDb.teamId,
        }),
      ).toEqual(secret);
      const recoveredAuth = createBetterAuthInstance(
        authEnv,
        app,
        { sendMagicLink: async () => undefined },
        { encryptionKeys: recovered, deploymentMode: 'managed' },
      );
      expect(
        await (
          await recoveredAuth.$context
        ).internalAdapter.findAccountByKey({
          issuer: 'https://accounts.google.com',
          accountId: 'restore-external-id',
        }),
      ).toMatchObject({
        accessToken: oauthToken,
        refreshToken: `${oauthToken}-refresh`,
        idToken: `${oauthToken}-id`,
      });
      await expect(
        isContactSuppressed(maintenance, recovered, {
          kind: 'email',
          value: email,
        }),
      ).resolves.toBe(true);
      const missing = structuredClone(rotatedConfiguration);
      missing.pii.keys = missing.pii.keys.filter(({ id }) => id !== 'v1');
      await expect(
        initializeEncryption({
          maintenancePool: maintenance,
          configuration: missing,
          loadRootKey,
        }),
      ).rejects.toThrow(EncryptionStartupError);
      await expect(
        initializeEncryption({
          maintenancePool: maintenance,
          configuration: rotatedConfiguration,
          loadRootKey: async (reference) =>
            reference === 'TEST_ROOT_THREE' ? rootThree : Buffer.alloc(32, 48),
        }),
      ).rejects.toThrow(EncryptionStartupError);
    } finally {
      await Promise.all([app.end(), maintenance.end()]);
      await restored.dispose();
    }
  });
});
