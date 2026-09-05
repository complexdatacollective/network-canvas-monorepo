import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { createBetterAuthInstance } from '../../auth/better-auth.ts';
import { readEnv } from '../../env.ts';
import { initializeEncryption } from '../initialize.ts';
import { ProtectedDataError } from '../protection.ts';
import { configuration, rootOne } from './fixtures.ts';

const database = await reachableDb();
const env = readEnv();

async function fixture(
  work: (input: {
    scratch: Awaited<ReturnType<typeof createScratchSchema>>;
    auth: ReturnType<typeof createBetterAuthInstance>;
    userId: string;
    headers: Headers;
  }) => Promise<void>,
) {
  if (!database || !env.auth)
    throw new Error('Local Postgres and auth configuration are required.');
  const scratch = await createScratchSchema(database);
  try {
    await provisionScratchSchema(scratch.pool);
    const keys = await initializeEncryption({
      maintenancePool: scratch.maintenance,
      configuration: configuration(),
      loadRootKey: async () => rootOne,
    });
    const auth = createBetterAuthInstance(
      {
        ...env.auth,
        socialProviders: {
          google: {
            clientId: 'synthetic-client',
            clientSecret: 'synthetic-secret',
          },
        },
      },
      scratch.app,
      { sendMagicLink: async () => undefined },
      { encryptionKeys: keys, deploymentMode: 'managed' },
    );
    const response = await auth.api.signUpEmail({
      body: {
        email: `oauth-${randomUUID()}@example.org`,
        name: 'Synthetic user',
        password: 'synthetic-password-12345',
      },
      asResponse: true,
    });
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    const result = z.object({ user: z.object({ id: z.string() }) }).parse(body);
    const headers = new Headers({
      cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '',
    });
    await work({ scratch, auth, userId: result.user.id, headers });
  } finally {
    await scratch.dispose();
  }
}

async function createProviderAccount(
  auth: ReturnType<typeof createBetterAuthInstance>,
  userId: string,
) {
  const context = await auth.$context;
  const account = await context.internalAdapter.createAccount({
    userId,
    accountId: `external-${randomUUID()}`,
    providerId: 'google',
    issuer: 'https://accounts.google.com',
    accessToken: 'synthetic-access-value',
    refreshToken: 'synthetic-refresh-value',
    idToken: 'synthetic-id-value',
    accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
  });
  expect(account).toMatchObject({
    accessToken: 'synthetic-access-value',
    refreshToken: 'synthetic-refresh-value',
    idToken: 'synthetic-id-value',
  });
  return account;
}

describe('Better Auth encrypted credential persistence', () => {
  it('encrypts all provider tokens at rest and audits real API reads before returning them', async () => {
    await fixture(async ({ scratch, auth, userId, headers }) => {
      const account = await createProviderAccount(auth, userId);
      const stored = await scratch.pool.query<{
        access_token_ciphertext: Buffer;
        refresh_token_ciphertext: Buffer;
        id_token_ciphertext: Buffer;
        accessToken: string | null;
        refreshToken: string | null;
        idToken: string | null;
      }>('SELECT * FROM account WHERE id = $1', [account.id]);
      const row = stored.rows[0]!;
      for (const ciphertext of [
        row.access_token_ciphertext,
        row.refresh_token_ciphertext,
        row.id_token_ciphertext,
      ]) {
        expect(Buffer.isBuffer(ciphertext)).toBe(true);
        expect(ciphertext[0]).toBe(1);
        expect(ciphertext.toString()).not.toContain('synthetic-');
      }
      expect([row.accessToken, row.refreshToken, row.idToken]).toEqual([
        null,
        null,
        null,
      ]);
      const before = await scratch.pool.query(
        'SELECT * FROM credential_audit_events WHERE account_id = $1',
        [account.id],
      );
      const token = await auth.api.getAccessToken({
        headers,
        body: { accountId: account.id },
      });
      expect(token.accessToken).toBe('synthetic-access-value');
      const after = await scratch.pool.query<{
        action: string;
        user_id: string;
        account_id: string;
      }>('SELECT * FROM credential_audit_events WHERE account_id = $1', [
        account.id,
      ]);
      expect(after.rows.length).toBeGreaterThan(before.rows.length);
      expect(
        after.rows.every(
          (event) =>
            event.account_id === account.id && event.user_id === userId,
        ),
      ).toBe(true);
      expect(JSON.stringify(after.rows)).not.toContain(
        'synthetic-access-value',
      );
    });
  });

  it('refuses another identity at the actual token endpoint', async () => {
    await fixture(async ({ auth, userId }) => {
      const account = await createProviderAccount(auth, userId);
      const other = await auth.api.signUpEmail({
        body: {
          email: `other-${randomUUID()}@example.org`,
          name: 'Other user',
          password: 'synthetic-password-12345',
        },
        asResponse: true,
      });
      expect(other.status).toBe(200);
      const denied = await auth.handler(
        new Request(`${env.auth!.baseUrl}/api/auth/get-access-token`, {
          method: 'POST',
          headers: new Headers({
            'cookie': other.headers.get('set-cookie')?.split(';')[0] ?? '',
            'content-type': 'application/json',
            'origin': env.auth!.baseUrl,
          }),
          body: JSON.stringify({ userId, accountId: account.id }),
        }),
      );
      expect(denied.status).toBe(400);
      expect(await denied.text()).not.toContain('synthetic-access-value');
    });
  });

  it('rolls back writes and releases no token when immutable audit insertion fails', async () => {
    await fixture(async ({ scratch, auth, userId, headers }) => {
      const account = await createProviderAccount(auth, userId);
      const before = await scratch.pool.query(
        'SELECT access_token_ciphertext FROM account WHERE id = $1',
        [account.id],
      );
      await scratch.pool.query(
        `CREATE FUNCTION reject_credential_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit unavailable'; END $$; CREATE TRIGGER reject_credential_test_audit BEFORE INSERT ON credential_audit_events FOR EACH ROW EXECUTE FUNCTION reject_credential_test_audit()`,
      );
      const context = await auth.$context;
      await expect(
        context.internalAdapter.updateAccount(account.id, {
          accessToken: 'changed-synthetic-secret',
        }),
      ).rejects.toThrow();
      const after = await scratch.pool.query(
        'SELECT access_token_ciphertext FROM account WHERE id = $1',
        [account.id],
      );
      expect(after.rows).toEqual(before.rows);
      await expect(
        auth.api.getAccessToken({
          headers,
          body: { accountId: account.id },
        }),
      ).rejects.toThrow('synthetic audit unavailable');
    });
  });

  it('rejects plaintext writes through the actual application role', async () => {
    await fixture(async ({ scratch, auth, userId }) => {
      const account = await createProviderAccount(auth, userId);
      await expect(
        scratch.app.query(
          'UPDATE account SET "accessToken" = $2 WHERE id = $1',
          [account.id, 'synthetic-plaintext'],
        ),
      ).rejects.toThrow('plaintext OAuth token writes are forbidden');
    });
  });

  it('fails authentication if ciphertext is moved to another account', async () => {
    await fixture(async ({ scratch, auth, userId, headers }) => {
      const first = await createProviderAccount(auth, userId);
      const second = await createProviderAccount(auth, userId);
      await expect(
        auth.api.getAccessToken({ headers, body: { accountId: first.id } }),
      ).resolves.toMatchObject({ accessToken: 'synthetic-access-value' });
      await scratch.pool.query(
        'UPDATE account SET access_token_ciphertext = (SELECT access_token_ciphertext FROM account WHERE id = $1) WHERE id = $2',
        [first.id, second.id],
      );
      await expect(
        auth.api.getAccessToken({ headers, body: { accountId: second.id } }),
      ).rejects.toThrow(ProtectedDataError);
    });
  });
});
