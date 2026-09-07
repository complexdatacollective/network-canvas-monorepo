import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import { seedTeam } from '../../__tests__/support/postgres.ts';
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
  it('visits a bounded native-PK page even when the corpus has no old-key rows', async () => {
    await participantFixture(async ({ scratch, keys, context, target }) => {
      await scratch.pool.query(
        `INSERT INTO participants (id, team_id, study_id, participant_code) SELECT gen_random_uuid(), $1, $2, 'B-' || n FROM generate_series(1, 10000) AS n`,
        [context.tenantDb.teamId, target.studyId],
      );
      await scratch.pool.query('ANALYZE participants');
      const boundary = (
        await scratch.pool.query<{ id: string }>(
          'SELECT id FROM participants ORDER BY id OFFSET 9900 LIMIT 1',
        )
      ).rows[0]!.id;
      const observedClient = await scratch.maintenance.connect();
      const queries = vi.spyOn(observedClient, 'query');
      observedClient.release();
      const result = await rotateEncryptionBatch(scratch.maintenance, keys, {
        limit: 1,
        cursor: {
          phase: 'participants',
          afterId: boundary,
          piiKeyId: 'v1',
          integrationKeyId: 'v1',
        },
      });
      expect(result).toMatchObject({
        processed: 0,
        scanned: 1,
        passComplete: false,
        cursor: { phase: 'participants' },
      });
      const calls = [...queries.mock.calls];
      queries.mockRestore();
      expect(
        calls.some(([sql]) => typeof sql === 'string' && /count\(/i.test(sql)),
      ).toBe(false);
      const page = calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('FROM participants'),
      );
      if (!page || typeof page[0] !== 'string' || !Array.isArray(page[1]))
        throw new Error('The actual participant page query was not observed.');
      const planSchema = z.object({
        Plan: z.object({
          'Shared Hit Blocks': z.number(),
          'Shared Read Blocks': z.number(),
        }),
      });
      const buffers = (value: unknown) => {
        const plan = planSchema.parse(value).Plan;
        return plan['Shared Hit Blocks'] + plan['Shared Read Blocks'];
      };
      const explainClient = await scratch.maintenance.connect();
      try {
        await explainClient.query('BEGIN');
        for (const [statement] of calls) {
          if (
            typeof statement === 'string' &&
            statement.startsWith('SET LOCAL enable_')
          )
            await explainClient.query(statement);
        }
        const plan = await explainClient.query(
          'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + page[0],
          page[1],
        );
        expect(buffers(plan.rows[0]['QUERY PLAN'][0])).toBeLessThan(32);
      } finally {
        await explainClient.query('ROLLBACK');
        explainClient.release();
      }
      // Positive control: the former UUID-to-text traversal really walks the
      // corpus. This distinguishes an indexed page from a vacuous empty query.
      const control = await scratch.maintenance.query(
        'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM participants WHERE id::text > $1 ORDER BY id::text LIMIT 1',
        [boundary],
      );
      expect(buffers(control.rows[0]['QUERY PLAN'][0])).toBeGreaterThan(100);
    });
  });

  it('advances the legacy cursor through non-legacy rows without a whole-corpus recount', async () => {
    await participantFixture(async ({ scratch, keys, context }) => {
      await scratch.pool.query(
        `INSERT INTO account (id, "userId", "accountId", "providerId", issuer, "updatedAt") VALUES ('already-current', $1, 'already-current', 'google', 'https://accounts.google.com', now())`,
        [context.principal.userId],
      );
      const observedClient = await scratch.pool.connect();
      const queries = vi.spyOn(observedClient, 'query');
      observedClient.release();
      const first = await migrateLegacyOAuthBatch(scratch.pool, keys, {
        limit: 1,
      });
      expect(first).toEqual({
        processed: 0,
        scanned: 1,
        afterId: 'already-current',
        passComplete: false,
      });
      expect(
        await migrateLegacyOAuthBatch(scratch.pool, keys, {
          limit: 1,
          afterId: first.afterId,
        }),
      ).toEqual({
        processed: 0,
        scanned: 0,
        afterId: null,
        passComplete: true,
      });
      expect(
        queries.mock.calls.some(
          ([sql]) => typeof sql === 'string' && /count\(/i.test(sql),
        ),
      ).toBe(false);
      queries.mockRestore();
    });
  });

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
        counts.push(result.processed);
        expect(result.scanned).toBeLessThanOrEqual(1);
        expect(result.passComplete).toBe(result.cursor === null);
        cursor = result.cursor;
        if (counts.length > 6)
          throw new Error('Rotation did not make bounded progress.');
      } while (cursor);
      expect(counts).toEqual([1, 1, 1, 0]);
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
      ).resolves.toMatchObject({
        processed: 0,
        scanned: 3,
        passComplete: true,
        cursor: null,
      });
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

  it('refuses malformed UUID, phase and stale purpose-target cursors', async () => {
    await participantFixture(async ({ scratch, keys }) => {
      const valid = {
        phase: 'participants',
        afterId: null,
        piiKeyId: 'v1',
        integrationKeyId: 'v1',
      } as const;
      for (const cursor of [
        { ...valid, afterId: 'not-a-uuid' },
        { ...valid, phase: 'invalid' },
        { ...valid, piiKeyId: 'v2' },
        { ...valid, integrationKeyId: 'v2' },
      ]) {
        await expect(
          rotateEncryptionBatch(scratch.maintenance, keys, {
            limit: 1,
            cursor: cursor as RotationCursor,
          }),
        ).rejects.toThrow();
      }
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
      const otherTeam = randomUUID();
      await seedTeam(scratch.pool, otherTeam);

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
              else events[0] = { ...events[0], teamId: otherTeam };
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
        migrateLegacyOAuthBatch(scratch.pool, keys, { limit: 1 }),
      ).resolves.toEqual({
        processed: 1,
        scanned: 1,
        afterId: id,
        passComplete: false,
      });
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
        migrateLegacyOAuthBatch(scratch.pool, keys, { limit: 1 }),
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
      expect(
        (
          await scratch.pool.query(
            'SELECT event_type, alert_policy_key FROM audit_alert_outbox ORDER BY audit_event_sequence',
          )
        ).rows,
      ).toEqual([
        {
          event_type: 'webhook.secret.updated',
          alert_policy_key: 'credential_access',
        },
        {
          event_type: 'webhook.secret.read',
          alert_policy_key: 'credential_access',
        },
      ]);
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
