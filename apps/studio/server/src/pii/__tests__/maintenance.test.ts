import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import { runAuditedSystemMutation } from '../../audit/command.ts';
import type { AuditEventInput } from '../../audit/events.ts';
import { createBetterAuthInstance } from '../../auth/better-auth.ts';
import { readEnv } from '../../env.ts';
import { createContactBlindIndex } from '../contacts.ts';
import {
  EncryptionStartupError,
  initializeCredentialMigration,
  initializeEncryption,
} from '../initialize.ts';
import {
  migrateLegacyOAuthBatch,
  rotateEncryptionBatch,
  type RotationCursor,
} from '../maintenance.ts';
import {
  readParticipantPiiField,
  updateParticipantPii,
} from '../participants.ts';
import { createDataProtection, ProtectedDataError } from '../protection.ts';
import { isContactSuppressed } from '../suppression.ts';
import { readWebhookSecret, setWebhookSecret } from '../webhooks.ts';
import { configuration, rootOne } from './fixtures.ts';
import { contacts, participantFixture } from './integration-fixture.ts';

const env = readEnv();
const signingSecret = Buffer.from('synthetic-webhook-secret-32-bytes');

async function addWebhook(
  input: Parameters<Parameters<typeof participantFixture>[0]>[0],
) {
  const id = randomUUID();
  const protection = createDataProtection(input.keys, {
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
      teamId: input.context.tenantDb.teamId,
      subscriptionId: id,
      column: 'secret_ciphertext',
    },
    signingSecret,
  );
  await input.scratch.pool.query(
    `INSERT INTO webhook_subscriptions (id, team_id, url, event_types, secret_ciphertext, secret_key_id, secret_algorithm, created_by_user_id) VALUES ($1, $2, 'https://hooks.example.org/studio', ARRAY['interview.completed'], $3, $4, $5, $6)`,
    [
      id,
      input.context.tenantDb.teamId,
      sealed.envelope,
      sealed.keyId,
      sealed.algorithm,
      input.context.principal.userId,
    ],
  );
  return id;
}

describe('bounded encryption maintenance and retained suppression', () => {
  it('resumes across PII, webhook and OAuth rows while keeping all contact indexes stable', async () => {
    await participantFixture(async (fixture) => {
      const { scratch, keys, context, target } = fixture;
      await updateParticipantPii(keys, context, target, contacts);
      const subscriptionId = await addWebhook(fixture);
      if (!env.auth) throw new Error('Auth configuration required.');
      const auth = createBetterAuthInstance(
        env.auth,
        scratch.app,
        { sendMagicLink: async () => undefined },
        { encryptionKeys: keys, deploymentMode: 'managed' },
      );
      const account = await (
        await auth.$context
      ).internalAdapter.createAccount({
        userId: context.principal.userId,
        accountId: 'external-synthetic',
        providerId: 'google',
        issuer: 'https://accounts.google.com',
        accessToken: 'synthetic-access',
        refreshToken: 'synthetic-refresh',
        idToken: 'synthetic-id',
      });
      const index = createContactBlindIndex(keys, {
        kind: 'email',
        value: contacts.email,
      });
      await scratch.maintenance.query(
        `INSERT INTO participant_contact_optouts (channel, recipient_blind_index, blind_index_key_id, source) VALUES ('email', $1, $2, 'provider')`,
        [index.value, index.keyId],
      );
      const before = await scratch.pool.query(
        'SELECT email_index, phone_index, blind_index_key_id, email_ciphertext FROM participants WHERE id = $1',
        [target.participantId],
      );
      await scratch.pool.query(
        "UPDATE studies SET state = 'closed', closed_at = now(), went_live_at = now() WHERE id = $1",
        [target.studyId],
      );
      const config = configuration();
      config.pii.current = 'v2';
      config.integration.current = 'v2';
      const rotatedKeys = await initializeEncryption({
        maintenancePool: scratch.maintenance,
        configuration: config,
        loadRootKey: async () => rootOne,
      });
      let cursor: RotationCursor | null = null;
      const counts: number[] = [];
      do {
        const result = await rotateEncryptionBatch(
          scratch.maintenance,
          rotatedKeys,
          { limit: 1, cursor },
        );
        expect(result.processed).toBeLessThanOrEqual(1);
        counts.push(result.remaining);
        cursor = result.cursor;
        if (counts.length > 6)
          throw new Error('Rotation did not make bounded progress.');
      } while (cursor);
      expect(counts).toEqual([2, 1, 0]);
      const after = await scratch.pool.query(
        'SELECT email_index, phone_index, blind_index_key_id, email_ciphertext, pii_key_id FROM participants WHERE id = $1',
        [target.participantId],
      );
      expect(after.rows[0]).toMatchObject({
        email_index: before.rows[0].email_index,
        phone_index: before.rows[0].phone_index,
        blind_index_key_id: 'index-1',
        pii_key_id: 'v2',
      });
      expect(after.rows[0].email_ciphertext).not.toEqual(
        before.rows[0].email_ciphertext,
      );
      expect(
        (
          await readParticipantPiiField(rotatedKeys, context, {
            ...target,
            column: 'email_ciphertext',
          })
        )?.toString(),
      ).toBe('person@example.org');
      expect(
        await readWebhookSecret(rotatedKeys, subscriptionId, {
          kind: 'rotation',
          maintenancePool: scratch.maintenance,
          teamId: context.tenantDb.teamId,
        }),
      ).toEqual(signingSecret);
      const current = createBetterAuthInstance(
        env.auth,
        scratch.app,
        { sendMagicLink: async () => undefined },
        { encryptionKeys: rotatedKeys, deploymentMode: 'managed' },
      );
      expect(
        await (
          await current.$context
        ).internalAdapter.findAccountByKey({
          issuer: 'https://accounts.google.com',
          accountId: 'external-synthetic',
        }),
      ).toMatchObject({
        accessToken: 'synthetic-access',
        refreshToken: 'synthetic-refresh',
        idToken: 'synthetic-id',
      });
      await expect(
        isContactSuppressed(scratch.maintenance, rotatedKeys, {
          kind: 'email',
          value: 'PERSON@example.org',
        }),
      ).resolves.toBe(true);
      expect(
        (await scratch.pool.query('SELECT * FROM encryption_key_verifications'))
          .rowCount,
      ).toBe(8);
      const events = await scratch.pool.query<{ event_type: string }>(
        "SELECT event_type FROM audit_events WHERE event_type IN ('participant.pii.rotated', 'webhook.secret.rotated') ORDER BY sequence",
      );
      expect(events.rows.map((event) => event.event_type)).toEqual([
        'participant.pii.rotated',
        'webhook.secret.rotated',
      ]);
      const oauthAudit = await scratch.pool.query(
        "SELECT action FROM credential_audit_events WHERE action = 'rotate' AND account_id = $1",
        [account.id],
      );
      expect(oauthAudit.rowCount).toBe(1);
      await expect(
        rotateEncryptionBatch(scratch.maintenance, rotatedKeys, { limit: 100 }),
      ).resolves.toMatchObject({ processed: 0, remaining: 0, cursor: null });
    });
  });

  it('preserves suppression after erasure and after changing the current blind-index version', async () => {
    await participantFixture(async ({ scratch, keys, context, target }) => {
      const contact = { kind: 'email', value: contacts.email } as const;
      const index = createContactBlindIndex(keys, contact);
      await scratch.maintenance.query(
        `INSERT INTO participant_contact_optouts (channel, recipient_blind_index, blind_index_key_id, source) VALUES ('email', $1, $2, 'provider')`,
        [index.value, index.keyId],
      );
      await updateParticipantPii(keys, context, target, contacts);
      await scratch.maintenance.query(
        'DELETE FROM participants WHERE id = $1',
        [target.participantId],
      );
      const config = configuration();
      config.blindIndex.current = 'index-2';
      const changed = await initializeEncryption({
        maintenancePool: scratch.maintenance,
        configuration: config,
        loadRootKey: async () => rootOne,
      });
      await expect(
        isContactSuppressed(scratch.maintenance, changed, contact),
      ).resolves.toBe(true);
      await expect(
        isContactSuppressed(scratch.maintenance, changed, {
          kind: 'email',
          value: 'different@example.org',
        }),
      ).resolves.toBe(false);
      await expect(
        isContactSuppressed(scratch.app, changed, contact),
      ).rejects.toThrow(ProtectedDataError);
    });
  });

  it('refuses an app pool, invalid bounds and a cursor for different current keys', async () => {
    await participantFixture(async ({ scratch, keys }) => {
      await expect(
        rotateEncryptionBatch(scratch.app, keys, { limit: 1 }),
      ).rejects.toThrow(ProtectedDataError);
      await expect(
        rotateEncryptionBatch(scratch.maintenance, keys, { limit: 101 }),
      ).rejects.toThrow();
      await expect(
        rotateEncryptionBatch(scratch.maintenance, keys, {
          limit: 1,
          cursor: {
            phase: 'participants',
            afterId: null,
            piiKeyId: 'other',
            integrationKeyId: 'v1',
          },
        }),
      ).rejects.toThrow(ProtectedDataError);
    });
  });

  it('does not confer system audit authority from a label and rolls back empty or forged event sets', async () => {
    await participantFixture(async ({ scratch, context, target }) => {
      let called = false;
      await expect(
        runAuditedSystemMutation(
          {
            tenantDb: context.tenantDb,
            actorLabel: 'Encryption maintenance',
            requestId: randomUUID(),
          },
          async () => {
            called = true;
            throw new Error('must not run');
          },
        ),
      ).rejects.toThrow('system audit requires the maintenance database role');
      expect(called).toBe(false);

      for (const defect of ['empty', 'wrong-team'] as const) {
        await expect(
          runAuditedSystemMutation(
            {
              tenantDb: createTenantDb(
                scratch.maintenance,
                context.tenantDb.teamId,
              ),
              actorLabel: 'Encryption maintenance',
              requestId: randomUUID(),
            },
            async (client, audit) => {
              await client.query(
                "UPDATE participants SET participant_code = 'changed' WHERE id = $1",
                [target.participantId],
              );
              const events: [AuditEventInput, ...AuditEventInput[]] = [
                {
                  ...audit,
                  eventType: 'participant.pii.rotated',
                  eventVersion: 1,
                  category: 'participant_data',
                  outcome: 'succeeded',
                  subjectType: null,
                  subjectId: null,
                  subjectLabel: null,
                  resourceType: 'participant',
                  resourceId: target.participantId,
                  resourceLabel: 'P-0001',
                  details: {
                    studyId: target.studyId,
                    columns: ['email_ciphertext'],
                  },
                },
              ];
              if (defect === 'empty') events.pop();
              else events[0] = { ...events[0], teamId: randomUUID() };
              return { result: undefined, events };
            },
          ),
        ).rejects.toThrow(
          defect === 'empty'
            ? 'must produce an event'
            : 'context does not match',
        );
        expect(
          (
            await scratch.pool.query(
              'SELECT participant_code FROM participants WHERE id = $1',
              [target.participantId],
            )
          ).rows,
        ).toEqual([{ participant_code: 'P-0001' }]);
        expect(
          (await scratch.pool.query('SELECT id FROM audit_events')).rowCount,
        ).toBe(0);
      }
    });
  });

  it('allows only encrypted-tier maintenance updates in a closed study', async () => {
    await participantFixture(async ({ scratch, keys, context, target }) => {
      await updateParticipantPii(keys, context, target, contacts);
      await scratch.pool.query(
        "UPDATE studies SET state = 'closed', closed_at = now(), went_live_at = now() WHERE id = $1",
        [target.studyId],
      );
      await expect(
        context.tenantDb.query(
          'UPDATE participants SET name_ciphertext = name_ciphertext WHERE id = $1',
          [target.participantId],
        ),
      ).rejects.toThrow('closed studies are read-only');
      await expect(
        createTenantDb(scratch.maintenance, context.tenantDb.teamId).query(
          "UPDATE participants SET participant_code = 'changed' WHERE id = $1",
          [target.participantId],
        ),
      ).rejects.toThrow('closed studies are read-only');
    });
  });

  it('converts legacy OAuth credentials in bounded audited transactions before boot can succeed', async () => {
    await participantFixture(async ({ scratch, context }) => {
      const id = randomUUID();
      await scratch.pool.query(
        `INSERT INTO account (id, "userId", "accountId", "providerId", issuer, "accessToken", "refreshToken", "updatedAt") VALUES ($1, $2, 'legacy-provider-id', 'google', 'https://accounts.google.com', 'legacy-access', 'legacy-refresh', now())`,
        [id, context.principal.userId],
      );
      const input = {
        maintenancePool: scratch.maintenance,
        configuration: configuration(),
        loadRootKey: async () => rootOne,
      };
      await expect(initializeEncryption(input)).rejects.toThrow(
        EncryptionStartupError,
      );
      const keys = await initializeCredentialMigration(input);
      await expect(
        migrateLegacyOAuthBatch(scratch.maintenance, keys, { limit: 1 }),
      ).resolves.toEqual({ processed: 1, afterId: null, remaining: 0 });
      await expect(initializeEncryption(input)).resolves.toBeDefined();
      const row = await scratch.pool.query(
        'SELECT "accessToken", "refreshToken", access_token_ciphertext, access_token_key_id FROM account WHERE id = $1',
        [id],
      );
      expect(row.rows[0]).toMatchObject({
        accessToken: null,
        refreshToken: null,
        access_token_key_id: 'v1',
      });
      expect(Buffer.isBuffer(row.rows[0].access_token_ciphertext)).toBe(true);
      expect(
        (
          await scratch.pool.query(
            "SELECT * FROM credential_audit_events WHERE account_id = $1 AND action = 'migrate_legacy'",
            [id],
          )
        ).rowCount,
      ).toBe(1);
      if (!env.auth) throw new Error('Auth configuration required.');
      const auth = createBetterAuthInstance(
        env.auth,
        scratch.app,
        { sendMagicLink: async () => undefined },
        { encryptionKeys: keys, deploymentMode: 'managed' },
      );
      expect(
        await (
          await auth.$context
        ).internalAdapter.findAccountByKey({
          issuer: 'https://accounts.google.com',
          accountId: 'legacy-provider-id',
        }),
      ).toMatchObject({
        accessToken: 'legacy-access',
        refreshToken: 'legacy-refresh',
      });
    });
  });

  it('preserves legacy plaintext if the conversion audit cannot commit', async () => {
    await participantFixture(async ({ scratch, context, keys }) => {
      const id = randomUUID();
      await scratch.pool.query(
        `INSERT INTO account (id, "userId", "accountId", "providerId", issuer, "accessToken", "updatedAt") VALUES ($1, $2, 'legacy-provider-id', 'google', 'https://accounts.google.com', 'legacy-access', now())`,
        [id, context.principal.userId],
      );
      await scratch.pool.query(
        `CREATE FUNCTION reject_legacy_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit unavailable'; END $$; CREATE TRIGGER reject_legacy_test_audit BEFORE INSERT ON credential_audit_events FOR EACH ROW EXECUTE FUNCTION reject_legacy_test_audit()`,
      );
      await expect(
        migrateLegacyOAuthBatch(scratch.maintenance, keys, { limit: 1 }),
      ).rejects.toThrow('synthetic audit unavailable');
      const row = await scratch.pool.query(
        'SELECT "accessToken", access_token_ciphertext FROM account WHERE id = $1',
        [id],
      );
      expect(row.rows).toEqual([
        { accessToken: 'legacy-access', access_token_ciphertext: null },
      ]);
    });
  });

  it('requires a live webhook delivery lease and does not let a member read configuration secrets', async () => {
    await participantFixture(async (fixture) => {
      const { scratch, keys, context } = fixture;
      const id = await addWebhook(fixture);
      await setWebhookSecret(keys, context, id, signingSecret);
      expect(
        await readWebhookSecret(keys, id, { kind: 'configuration', context }),
      ).toEqual(signingSecret);
      const deliveryId = randomUUID();
      const leaseOwner = randomUUID();
      await scratch.pool.query(
        `INSERT INTO webhook_deliveries (id, team_id, subscription_id, webhook_id, event_type, payload, lease_owner, lease_expires_at) VALUES ($1, $2, $3, 'synthetic-webhook-id', 'interview.completed', '{}', $4, now() + interval '1 minute')`,
        [deliveryId, context.tenantDb.teamId, id, leaseOwner],
      );
      const authority = {
        kind: 'delivery',
        maintenancePool: scratch.maintenance,
        teamId: context.tenantDb.teamId,
        deliveryId,
        leaseOwner,
      } as const;
      expect(await readWebhookSecret(keys, id, authority)).toEqual(
        signingSecret,
      );
      await expect(
        readWebhookSecret(keys, id, { ...authority, leaseOwner: randomUUID() }),
      ).rejects.toThrow(ProtectedDataError);
      await scratch.pool.query(
        "UPDATE webhook_deliveries SET lease_expires_at = now() - interval '1 second' WHERE id = $1",
        [deliveryId],
      );
      await expect(readWebhookSecret(keys, id, authority)).rejects.toThrow(
        ProtectedDataError,
      );
      await scratch.pool.query(
        "UPDATE team_members SET role = 'member' WHERE user_id = $1",
        [context.principal.userId],
      );
      await expect(
        readWebhookSecret(keys, id, { kind: 'configuration', context }),
      ).rejects.toThrow(ProtectedDataError);
    });
  });
});
