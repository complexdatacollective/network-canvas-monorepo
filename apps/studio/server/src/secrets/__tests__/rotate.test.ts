import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import {
  testKeyring,
  testKeyringEntry,
} from '../../__tests__/support/secrets.ts';
import {
  assertSecretKeysProducible,
  SecretKeyCheckError,
  SecretKeyIdMalformedError,
  SecretKeyMaterialError,
  SecretKeyMissingError,
  secretKeyIdsInUse,
} from '../boot.ts';
import { createSecretsCipher } from '../cipher.ts';
import { parseKeyring } from '../keyring.ts';
import { RotationIncompleteError, rotateSecrets } from '../rotate.ts';

// Rotation against real rows, because every property it has to hold is a
// property of the transactions: that it re-seals what is behind and leaves
// what is current alone, that a second run finds nothing, that an interrupted
// run keeps what it committed, and that it refuses outright rather than
// half-rotating a database whose keyring is incomplete.

const db = await reachableDb();

const TEAM = 'team-rotation';
/** The protocol line every asset key below belongs to. */
const PROTOCOL = '3f1c9b4e-0a2d-4c5e-9b8a-6d7e5f4c3b2a';
/** A key id no keyring in this file carries: a half-removed rotation entry. */
const MISSING = 'gone';

/** `test-2` current, `test-1` readable: what the database was written under. */
const BEFORE = testKeyring(['test-2', 'test-1']);
/** `test-1` current, `test-2` readable: the keyring a rotation deploys. */
const AFTER = testKeyring(['test-1', 'test-2']);

/**
 * `test-1` by name, another key by material: the shape a restore from the
 * wrong backup, or a regenerated keyring, leaves behind.
 */
const IMPOSTOR = parseKeyring(
  `test-1:${testKeyringEntry('test-impostor').split(':')[1]!}`,
);

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
    // `protocol_asset_keys` rows are pinned to a protocol by a composite
    // foreign key, so the line has to exist before any key can be stored
    // against it.
    await pool.query(
      `INSERT INTO protocols (id, team_id, name) VALUES ($1, $2, 'Rotation protocol')`,
      [PROTOCOL, TEAM],
    );
  }, 60_000);

  afterAll(async () => {
    await scratch.dispose();
  });

  afterEach(async () => {
    await pool.query('DELETE FROM webhook_subscriptions');
    await pool.query('DELETE FROM account');
    await pool.query('DELETE FROM protocol_asset_keys');
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

  /** One sealed API key for `PROTOCOL`, returning its asset id and plaintext. */
  async function newAssetKey(
    cipher = before,
    keyIdOverride?: string,
  ): Promise<{ assetId: string; value: string }> {
    const assetId = `asset-${randomUUID()}`;
    const value = `pk.${randomUUID().replaceAll('-', '')}`;
    const sealed = cipher.sealAssetKey(
      { teamId: TEAM, protocolId: PROTOCOL, assetId },
      value,
    );
    await pool.query(
      `INSERT INTO protocol_asset_keys
         (team_id, protocol_id, asset_id, ciphertext, key_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        TEAM,
        PROTOCOL,
        assetId,
        sealed.ciphertext,
        keyIdOverride ?? sealed.keyId,
      ],
    );
    return { assetId, value };
  }

  const assetKeyRows = async () =>
    (
      await pool.query<{
        asset_id: string;
        ciphertext: Buffer;
        key_id: string;
        updated_at: Date;
      }>(
        'SELECT asset_id, ciphertext, key_id, updated_at FROM protocol_asset_keys ORDER BY asset_id',
      )
    ).rows;

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
    const assetKey = await newAssetKey();
    const stored = (await accountRows())[0]!;
    const storedAt = stored.updatedAt;
    const assetStoredAt = (await assetKeyRows())[0]!.updated_at;

    const counts = await rotateSecrets(maintenance, AFTER);
    expect(counts).toEqual({
      webhook_subscriptions: 1,
      account: 1,
      protocol_asset_keys: 1,
    });

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
    const [rotatedAssetKey] = await assetKeyRows();
    expect(rotatedAssetKey?.key_id).toBe('test-1');
    expect(
      after.openAssetKey(
        {
          teamId: TEAM,
          protocolId: PROTOCOL,
          assetId: assetKey.assetId,
        },
        {
          ciphertext: rotatedAssetKey!.ciphertext,
          keyId: rotatedAssetKey!.key_id,
        },
      ),
    ).toBe(assetKey.value);

    // Rotation changes how a row is stored, not when anyone last changed it:
    // a bumped timestamp would make every audit and every "recently changed"
    // view lie the day a deployment re-keys.
    expect(rotatedAccount?.updatedAt).toEqual(storedAt);
    expect(rotatedAssetKey?.updated_at).toEqual(assetStoredAt);
  });

  it('leaves an asset key that is already current byte for byte alone', async () => {
    // Sealed under the keyring the rotation deploys, so there is nothing to
    // do: a re-seal under the same key would draw a new nonce and still pass
    // a count-only assertion.
    await newAssetKey(after);
    const stored = await assetKeyRows();

    expect((await rotateSecrets(maintenance, AFTER)).protocol_asset_keys).toBe(
      0,
    );
    expect(await assetKeyRows()).toEqual(stored);
  });

  it('refuses to rotate an asset key sealed under a missing entry', async () => {
    const behind = await newAssetKey();
    await newAssetKey(before, MISSING);
    const stored = await assetKeyRows();

    await expect(rotateSecrets(maintenance, AFTER)).rejects.toThrow(
      new RegExp(`cannot produce: ${MISSING}`),
    );
    // Including the row it could have rotated: the check runs before any
    // write, so an incomplete keyring rotates nothing rather than some.
    expect(await assetKeyRows()).toEqual(stored);
    expect(stored.find((row) => row.asset_id === behind.assetId)?.key_id).toBe(
      'test-2',
    );
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
    await newAssetKey();
    await rotateSecrets(maintenance, AFTER);
    const first = await subscriptionRows();
    const firstAccounts = await accountRows();
    const firstAssetKeys = await assetKeyRows();

    // Idempotent in the strong sense: not merely "reports zero", but leaves
    // the stored bytes identical. A re-seal under the same key would produce
    // a new nonce and pass a count-only assertion.
    expect(await rotateSecrets(maintenance, AFTER)).toEqual({
      webhook_subscriptions: 0,
      account: 0,
      protocol_asset_keys: 0,
    });
    expect(await subscriptionRows()).toEqual(first);
    expect(await accountRows()).toEqual(firstAccounts);
    expect(await assetKeyRows()).toEqual(firstAssetKeys);
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
      protocol_asset_keys: 0,
    });
    expect(
      (await subscriptionRows()).every((row) => row.secret_key_id === 'test-1'),
    ).toBe(true);
  });

  it('refuses to report success while another transaction holds a row', async () => {
    const held = await newSubscription();
    await newSubscription();

    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(
        'SELECT id FROM webhook_subscriptions WHERE id = $1 FOR UPDATE',
        [held.id],
      );
      // FOR UPDATE SKIP LOCKED means a held row makes a batch return zero,
      // which is also how a finished store reports itself. Believing it let
      // the command print "every stored secret is now under key id …" with a
      // row still sealed under the entry the operator is about to remove.
      const refused = rotateSecrets(maintenance, AFTER);
      await expect(refused).rejects.toThrow(RotationIncompleteError);
      await expect(refused).rejects.toThrow(
        /webhook_subscriptions: 1 row still under another key \(held by another session, or written under an older key while this ran\); run rotate-secrets again/,
      );
    } finally {
      // In `finally` so a failed assertion still gives the row lock back:
      // released with its transaction open, this connection would block the
      // cleanup DELETE and every later test with it.
      await holder.query('ROLLBACK').catch(() => undefined);
      holder.release();
    }

    // The batch that did commit is still committed: the postcondition reports,
    // it does not roll anything back.
    expect(
      (await subscriptionRows()).filter(
        (row) => row.secret_key_id === 'test-1',
      ),
    ).toHaveLength(1);

    // And the rerun the message asks for finishes the job.
    expect(await rotateSecrets(maintenance, AFTER)).toEqual({
      webhook_subscriptions: 1,
      account: 0,
      protocol_asset_keys: 0,
    });
    expect(
      (await subscriptionRows()).every((row) => row.secret_key_id === 'test-1'),
    ).toBe(true);
  });

  it('reports the key ids in use across every store', async () => {
    await newSubscription();
    await newSubscription(before, MISSING);
    await newAccount();
    await newAssetKey(before, 'asset-gone');
    // What the boot check compares against the keyring: one set, from every
    // store, however many tables the registry grows to.
    const client = await maintenance.connect();
    try {
      expect(await secretKeyIdsInUse(client)).toEqual([
        'asset-gone',
        MISSING,
        'test-2',
      ]);
    } finally {
      client.release();
    }
  });

  it('refuses at boot when a stored key id is not a keyring id', async () => {
    // A row whose key id is not one a keyring could hold cannot be opened by
    // any keyring, so dropping it from the comparison made the boot check pass
    // on a database it had just proved unreadable. It is counted instead, and
    // the count says which table without ever printing what the column holds:
    // these ids are read back out of stored text, and a boot refusal must not
    // be a way to get arbitrary stored bytes into a log.
    await newSubscription(before, 'not a key id');
    await newSubscription(before, 'nor is this');
    await newAssetKey(before, 'not a key id either');
    await pool.query(
      `INSERT INTO account
         (id, "accountId", "providerId", issuer, "userId", "accessToken", "updatedAt")
       VALUES ($1, $1, 'google', 'https://accounts.google.com', 'user-rotation',
               'studio-secret::whatever', now())`,
      [randomUUID()],
    );

    const act = assertSecretKeysProducible(maintenance, AFTER);
    await expect(act).rejects.toThrow(SecretKeyIdMalformedError);
    // Every refusal from the boot check is one type to catch: that is what
    // `verifySecretKeysOrExit` prints as a sentence rather than a stack.
    await expect(act).rejects.toThrow(SecretKeyCheckError);
    const error = await act.catch((reason: unknown) => reason);
    const message = error instanceof Error ? error.message : String(error);
    expect(message).toContain(
      '2 stored key ids in webhook_subscriptions are not keyring ids',
    );
    expect(message).toContain(
      '1 stored key id in protocol_asset_keys is not a keyring id',
    );
    expect(message).toContain('1 stored key id in account is not a keyring id');
    // Never the text itself.
    expect(message).not.toContain('not a key id');
    expect(message).not.toContain('whatever');
  });

  it('refuses at boot when the keyring holds an id under different material', async () => {
    // A restored database and a keyring that both name `test-1` but disagree
    // about what it is: every id is present, so the produce-check passed and
    // the deployment came up to fail one webhook signature at a time.
    await newSubscription(after);
    await newAccount(after);
    await newAssetKey(after);

    const refused = assertSecretKeysProducible(maintenance, IMPOSTOR);
    await expect(refused).rejects.toThrow(SecretKeyMaterialError);
    await expect(refused).rejects.toThrow(
      /Key id "test-1" in the keyring does not open the stored secrets sealed under it/,
    );
    // The keyring that does match still passes, so the probe is not simply
    // refusing everything.
    await expect(
      assertSecretKeysProducible(maintenance, AFTER),
    ).resolves.toBeUndefined();
  });

  it('refuses a row whose only token is plaintext', async () => {
    // Selected on "is not under the current key" rather than on carrying a
    // sealed prefix: a row whose only token is plaintext matched neither, so
    // rotation walked past it and reported success with plaintext at rest.
    const id = randomUUID();
    await pool.query(
      `INSERT INTO account
         (id, "accountId", "providerId", issuer, "userId", "refreshToken", "updatedAt")
       VALUES ($1, $2, 'google', 'https://accounts.google.com', 'user-rotation',
               '1//written-around-the-adapter', now())`,
      [id, `sub-${id}`],
    );

    await expect(rotateSecrets(maintenance, AFTER)).rejects.toThrow(
      new RegExp(`account ${id} refreshToken could not be re-sealed`),
    );
    const [row] = await accountRows();
    expect(row?.refreshToken).toBe('1//written-around-the-adapter');
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
