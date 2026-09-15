import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import { testKeyring } from '../../__tests__/support/secrets.ts';
import { SecretKeyMissingError, secretKeyIdsInUse } from '../boot.ts';
import { createSecretsCipher } from '../cipher.ts';
import { rotateSecrets } from '../rotate.ts';

// Rotation against real rows, because every property it has to hold is a
// property of the transactions: that it re-seals what is behind and leaves
// what is current alone, that a second run finds nothing, that an interrupted
// run keeps what it committed, and that it refuses outright rather than
// half-rotating a database whose keyring is incomplete.

const db = await reachableDb();

const TEAM = 'team-rotation';
/** A key id no keyring in this file carries: a half-removed rotation entry. */
const MISSING = 'gone';

/** `test-2` current, `test-1` readable: what the database was written under. */
const BEFORE = testKeyring(['test-2', 'test-1']);
/** `test-1` current, `test-2` readable: the keyring a rotation deploys. */
const AFTER = testKeyring(['test-1', 'test-2']);

const before = createSecretsCipher(BEFORE);
const after = createSecretsCipher(AFTER);

describe.skipIf(!db)('rotating stored secrets', () => {
  let scratch: Awaited<ReturnType<typeof createScratchSchema>>;
  /** The connecting login: fixtures and cross-team oracles. */
  let pool: pg.Pool;
  /** What rotation itself runs as, and the only identity that sees every team. */
  let maintenance: pg.Pool;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    scratch = await createScratchSchema(db);
    pool = scratch.pool;
    maintenance = scratch.maintenance;
    await provisionScratchSchema(pool);
    await seedTeam(pool, TEAM);
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified")
       VALUES ('user-rotation', 'Rotation', 'rotation@example.test', true)`,
    );
  }, 60_000);

  afterAll(async () => {
    await scratch.dispose();
  });

  afterEach(async () => {
    await pool.query('DELETE FROM webhook_subscriptions');
    await pool.query('DELETE FROM account');
  });

  /** A subscription sealed by `cipher`, returning its id and its plaintext. */
  async function newSubscription(
    cipher = before,
    keyIdOverride?: string,
  ): Promise<{ id: string; secret: string }> {
    const id = randomUUID();
    const secret = `whsec_${randomUUID().replaceAll('-', '')}`;
    const sealed = cipher.sealWebhookSecret(
      { teamId: TEAM, subscriptionId: id },
      secret,
    );
    await pool.query(
      `INSERT INTO webhook_subscriptions
         (id, team_id, url, event_types, secret_ciphertext, secret_key_id, created_by_user_id)
       VALUES ($1, $2, 'https://hooks.example.org/studio', ARRAY['interview.completed'], $3, $4, 'user-rotation')`,
      [id, TEAM, sealed.ciphertext, keyIdOverride ?? sealed.keyId],
    );
    return { id, secret };
  }

  async function newAccount(
    cipher = before,
    tokens: Partial<
      Record<'accessToken' | 'refreshToken' | 'idToken', string>
    > = {
      accessToken: 'ya29.access',
      refreshToken: '1//refresh',
      idToken: 'eyJ.id',
    },
  ): Promise<{ id: string; accountId: string; tokens: typeof tokens }> {
    const id = randomUUID();
    const accountId = `sub-${randomUUID()}`;
    const sealed = (column: 'accessToken' | 'refreshToken' | 'idToken') =>
      tokens[column] === undefined
        ? null
        : cipher.sealOAuthToken(
            { providerId: 'google', accountId, column },
            tokens[column],
          );
    await pool.query(
      `INSERT INTO account
         (id, "accountId", "providerId", issuer, "userId",
          "accessToken", "refreshToken", "idToken", "updatedAt")
       VALUES ($1, $2, 'google', 'https://accounts.google.com', 'user-rotation',
               $3, $4, $5, now())`,
      [
        id,
        accountId,
        sealed('accessToken'),
        sealed('refreshToken'),
        sealed('idToken'),
      ],
    );
    return { id, accountId, tokens };
  }

  const subscriptionRows = async () =>
    (
      await pool.query<{
        id: string;
        secret_ciphertext: Buffer;
        secret_key_id: string;
        updated_at: Date;
      }>(
        'SELECT id, secret_ciphertext, secret_key_id, updated_at FROM webhook_subscriptions ORDER BY id',
      )
    ).rows;

  const accountRows = async () =>
    (
      await pool.query<{
        id: string;
        accountId: string;
        accessToken: string | null;
        refreshToken: string | null;
        idToken: string | null;
        updatedAt: Date;
      }>(
        'SELECT id, "accountId", "accessToken", "refreshToken", "idToken", "updatedAt" FROM account ORDER BY id',
      )
    ).rows;

  it('re-seals every store under the current key, plaintext unchanged', async () => {
    const subscription = await newSubscription();
    const account = await newAccount();
    const stored = (await accountRows())[0]!;
    const storedAt = stored.updatedAt;

    const counts = await rotateSecrets(maintenance, AFTER);
    expect(counts).toEqual({ webhook_subscriptions: 1, account: 1 });

    const [rotatedSubscription] = await subscriptionRows();
    expect(rotatedSubscription?.secret_key_id).toBe('test-1');
    expect(
      after.openWebhookSecret(
        { teamId: TEAM, subscriptionId: subscription.id },
        {
          ciphertext: rotatedSubscription!.secret_ciphertext,
          keyId: rotatedSubscription!.secret_key_id,
        },
      ),
    ).toBe(subscription.secret);

    const [rotatedAccount] = await accountRows();
    for (const column of ['accessToken', 'refreshToken', 'idToken'] as const) {
      const value = rotatedAccount![column];
      expect(value?.startsWith('studio-secret:test-1:')).toBe(true);
      expect(
        after.openOAuthToken(
          { providerId: 'google', accountId: account.accountId, column },
          value!,
        ),
      ).toBe(account.tokens[column]);
    }
    // Rotation changes how a row is stored, not when anyone last changed it:
    // a bumped timestamp would make every audit and every "recently changed"
    // view lie the day a deployment re-keys.
    expect(rotatedAccount?.updatedAt).toEqual(storedAt);
  });

  it('re-seals the tokens a row does have and leaves the others null', async () => {
    const account = await newAccount(before, { accessToken: 'ya29.only' });
    await rotateSecrets(maintenance, AFTER);
    const [row] = await accountRows();
    expect(row?.refreshToken).toBeNull();
    expect(row?.idToken).toBeNull();
    expect(
      after.openOAuthToken(
        {
          providerId: 'google',
          accountId: account.accountId,
          column: 'accessToken',
        },
        row!.accessToken!,
      ),
    ).toBe('ya29.only');
  });

  it('finds nothing to do on a second run, and rewrites no row', async () => {
    await newSubscription();
    await newAccount();
    await rotateSecrets(maintenance, AFTER);
    const first = await subscriptionRows();
    const firstAccounts = await accountRows();

    // Idempotent in the strong sense: not merely "reports zero", but leaves
    // the stored bytes identical. A re-seal under the same key would produce
    // a new nonce and pass a count-only assertion.
    expect(await rotateSecrets(maintenance, AFTER)).toEqual({
      webhook_subscriptions: 0,
      account: 0,
    });
    expect(await subscriptionRows()).toEqual(first);
    expect(await accountRows()).toEqual(firstAccounts);
  });

  it('keeps the batches it committed when a run is interrupted', async () => {
    for (let index = 0; index < 3; index += 1) await newSubscription();

    let batches = 0;
    await expect(
      rotateSecrets(maintenance, AFTER, {
        batchSize: 1,
        log: () => {
          batches += 1;
          // Stands in for the process being killed between batches, which is
          // the failure resumability is for: the run ends after a commit.
          throw new Error('interrupted');
        },
      }),
    ).rejects.toThrow(/interrupted/);
    expect(batches).toBe(1);

    const partial = await subscriptionRows();
    expect(
      partial.filter((row) => row.secret_key_id === 'test-1'),
    ).toHaveLength(1);

    // The rerun is the whole point: it finishes the rest and does not redo the
    // batch that already committed.
    expect(await rotateSecrets(maintenance, AFTER)).toEqual({
      webhook_subscriptions: 2,
      account: 0,
    });
    expect(
      (await subscriptionRows()).every((row) => row.secret_key_id === 'test-1'),
    ).toBe(true);
  });

  it('skips a row another transaction holds, and takes it on the rerun', async () => {
    const held = await newSubscription();
    await newSubscription();

    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(
        'SELECT id FROM webhook_subscriptions WHERE id = $1 FOR UPDATE',
        [held.id],
      );
      // FOR UPDATE SKIP LOCKED: a rotation must never queue behind a live
      // writer holding a row, because the command would then appear to hang.
      expect(await rotateSecrets(maintenance, AFTER)).toEqual({
        webhook_subscriptions: 1,
        account: 0,
      });
      await holder.query('ROLLBACK');
    } finally {
      holder.release();
    }

    expect(await rotateSecrets(maintenance, AFTER)).toEqual({
      webhook_subscriptions: 1,
      account: 0,
    });
    expect(
      (await subscriptionRows()).every((row) => row.secret_key_id === 'test-1'),
    ).toBe(true);
  });

  it('reports the key ids in use across every store', async () => {
    await newSubscription();
    await newSubscription(before, MISSING);
    await newAccount();
    // What the boot check compares against the keyring: one set, from every
    // store, however many tables the registry grows to.
    const client = await maintenance.connect();
    try {
      expect(await secretKeyIdsInUse(client)).toEqual([MISSING, 'test-2']);
    } finally {
      client.release();
    }
  });

  it('ignores a stored key id no keyring could hold', async () => {
    // These ids are read back out of stored text. A boot refusal names them,
    // so a column holding something else must not be a way to get arbitrary
    // stored bytes into a log — and a row like that cannot be opened anyway,
    // which is a failure at its use site.
    await newSubscription(before, 'not a key id');
    await pool.query(
      `INSERT INTO account
         (id, "accountId", "providerId", issuer, "userId", "accessToken", "updatedAt")
       VALUES ($1, $1, 'google', 'https://accounts.google.com', 'user-rotation',
               'studio-secret::whatever', now())`,
      [randomUUID()],
    );
    const client = await maintenance.connect();
    try {
      expect(await secretKeyIdsInUse(client)).toEqual([]);
    } finally {
      client.release();
    }
  });

  it('refuses a keyring missing a stored key id, and rotates nothing', async () => {
    await newSubscription();
    await newSubscription(before, MISSING);
    const stored = await subscriptionRows();

    await expect(rotateSecrets(maintenance, AFTER)).rejects.toThrow(
      SecretKeyMissingError,
    );
    await expect(rotateSecrets(maintenance, AFTER)).rejects.toThrow(
      new RegExp(`cannot produce: ${MISSING}`),
    );
    // Not one row: a partial rotation under an incomplete keyring is the state
    // this command exists to get a deployment out of, not into.
    expect(await subscriptionRows()).toEqual(stored);
  });

  it('refuses a plaintext token rather than sealing it on the way past', async () => {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO account
         (id, "accountId", "providerId", issuer, "userId",
          "accessToken", "refreshToken", "updatedAt")
       VALUES ($1, $2, 'google', 'https://accounts.google.com', 'user-rotation',
               $3, 'ya29.written-around-the-adapter', now())`,
      [
        id,
        `sub-${id}`,
        before.sealOAuthToken(
          {
            providerId: 'google',
            accountId: `sub-${id}`,
            column: 'accessToken',
          },
          'ya29.sealed',
        ),
      ],
    );

    // Sealing it here would hide the write that bypassed the auth adapter, and
    // the row would look rotated ever after.
    await expect(rotateSecrets(maintenance, AFTER)).rejects.toThrow(
      new RegExp(`account ${id} refreshToken could not be re-sealed`),
    );
    const [row] = await accountRows();
    expect(row?.refreshToken).toBe('ya29.written-around-the-adapter');
    expect(row?.accessToken?.startsWith('studio-secret:test-2:')).toBe(true);
  });

  it('refuses a batch size that would never finish', async () => {
    await expect(
      rotateSecrets(maintenance, AFTER, { batchSize: 0 }),
    ).rejects.toThrow(/positive integer/);
  });
});
