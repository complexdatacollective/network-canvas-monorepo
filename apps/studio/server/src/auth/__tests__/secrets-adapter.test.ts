import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { testCipher, testKeyring } from '../../__tests__/support/secrets.ts';
import { readEnv } from '../../env.ts';
import {
  type OAuthTokenColumn,
  parseOAuthTokenKeyId,
  type SecretsCipher,
} from '../../secrets/cipher.ts';
import { SecretUnreadableError } from '../../secrets/envelope.ts';
import { createBetterAuthInstance } from '../better-auth.ts';

// Driven through a real better-auth instance rather than the wrapper alone:
// what has to hold is that better-auth's own paths — the transaction an OAuth
// sign-up runs in, the join behind `findUserByEmail`, the bulk write behind
// `updatePassword` — all land on sealed columns and read back plaintext. A
// wrapper tested in isolation would still pass if better-auth reached the
// database by a route the wrapper does not cover.

const env = readEnv();
const db = await reachableDb();

const TOKEN_COLUMNS: readonly OAuthTokenColumn[] = [
  'accessToken',
  'refreshToken',
  'idToken',
];

const GOOGLE = {
  providerId: 'google',
  issuer: 'https://accounts.google.com',
};

const MICROSOFT = {
  providerId: 'microsoft',
  issuer: 'https://login.microsoftonline.com/a-tenant/v2.0',
};

/** Distinctive enough that a substring check for them means something. */
const TOKENS = {
  accessToken: 'ya29.a0-studio-access-token',
  refreshToken: '1//04-studio-refresh-token',
  idToken: 'eyJhbGciOiJSUzI1NiJ9.studio-id-token.signature',
};

/** `createLocalAccountIssuer('credential')`, the password account's issuer. */
const CREDENTIAL_ISSUER = 'local:credential';

type StoredTokens = Record<OAuthTokenColumn, string | null>;

describe.skipIf(!db)('OAuth tokens sealed inside the auth adapter', () => {
  let scratch: Awaited<ReturnType<typeof createScratchSchema>> | undefined;

  beforeAll(async () => {
    if (!db) return;
    scratch = await createScratchSchema(db);
    await provisionScratchSchema(scratch.pool);
  });

  afterAll(async () => {
    await scratch?.dispose();
  });

  /**
   * A better-auth instance on the scratch schema, wired through the real
   * constructor so the adapter under test is the one the server builds.
   */
  function contextFor(cipher: SecretsCipher) {
    if (!env.auth) throw new Error('dev env must configure auth');
    if (!scratch) throw new Error('the scratch schema was not provisioned');
    return createBetterAuthInstance(
      env.auth,
      scratch.pool,
      () => Promise.resolve(),
      cipher,
    ).$context;
  }

  /** What is actually on disk — read around the adapter, never through it. */
  async function storedTokens(accountId: string): Promise<StoredTokens> {
    if (!scratch) throw new Error('the scratch schema was not provisioned');
    const { rows } = await scratch.pool.query<StoredTokens>(
      'select "accessToken", "refreshToken", "idToken" from account where "accountId" = $1',
      [accountId],
    );
    if (rows.length !== 1) {
      throw new Error(`expected one account row, found ${rows.length}`);
    }
    return rows[0]!;
  }

  async function overwriteAccessToken(
    accountId: string,
    value: string,
  ): Promise<void> {
    if (!scratch) throw new Error('the scratch schema was not provisioned');
    await scratch.pool.query(
      'update account set "accessToken" = $1 where "accountId" = $2',
      [value, accountId],
    );
  }

  /**
   * The first-sign-in path: `createOAuthUser` creates the user and the account
   * inside `runWithTransaction`, so the account write goes through the
   * transaction's adapter rather than the one better-auth was configured with.
   */
  async function signUpWithGoogle(cipher: SecretsCipher) {
    const ctx = await contextFor(cipher);
    const email = `${randomUUID()}@example.com`;
    const accountId = randomUUID();
    const created = await ctx.internalAdapter.createOAuthUser(
      { name: 'Researcher', email, emailVerified: true, image: null },
      { ...GOOGLE, accountId, ...TOKENS },
    );
    return { ctx, email, accountId, ...created };
  }

  it('seals all three token columns written by an OAuth sign-up', async () => {
    const { account, accountId } = await signUpWithGoogle(testCipher());

    // What better-auth is handed back is plaintext: the seal is the database's
    // business, not the caller's.
    expect(account).toMatchObject(TOKENS);

    const stored = await storedTokens(accountId);
    for (const column of TOKEN_COLUMNS) {
      const value = stored[column];
      expect(value).toMatch(/^studio-secret:/);
      expect(parseOAuthTokenKeyId(value!)).toBe('test-1');
      // Neither the token nor an encoding of it survives anywhere in the
      // stored string — the check that would catch a seal that only wrapped.
      const token = TOKENS[column];
      expect(value).not.toContain(token);
      expect(value).not.toContain(Buffer.from(token).toString('base64'));
      expect(value).not.toContain(Buffer.from(token).toString('base64url'));
    }
  });

  it('returns the plaintext through findAccounts', async () => {
    const { ctx, user } = await signUpWithGoogle(testCipher());

    const accounts = await ctx.internalAdapter.findAccounts(user.id);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject(TOKENS);
  });

  it('opens the accounts joined onto a user lookup', async () => {
    const { ctx, email } = await signUpWithGoogle(testCipher());

    const found = await ctx.internalAdapter.findUserByEmail(email, {
      includeAccounts: true,
    });
    expect(found?.accounts).toHaveLength(1);
    expect(found?.accounts[0]).toMatchObject(TOKENS);
  });

  it('refuses a sealed value copied onto another provider’s row', async () => {
    const { ctx, user, accountId } = await signUpWithGoogle(testCipher());
    const otherAccountId = randomUUID();
    await ctx.internalAdapter.linkAccount({
      ...MICROSOFT,
      accountId: otherAccountId,
      userId: user.id,
      accessToken: 'a-microsoft-access-token',
    });

    const google = await storedTokens(accountId);
    await overwriteAccessToken(otherAccountId, google.accessToken!);

    // The row identity is bound into the ciphertext, so the same bytes in
    // another account's row do not open — a stolen-and-replanted value is a
    // failure, not a working token.
    await expect(
      ctx.internalAdapter.findAccountByKey({
        issuer: MICROSOFT.issuer,
        accountId: otherAccountId,
      }),
    ).rejects.toThrow(SecretUnreadableError);
  });

  it('refuses a plaintext token written straight into the column', async () => {
    const { ctx, user, accountId } = await signUpWithGoogle(testCipher());

    await overwriteAccessToken(accountId, 'a-plaintext-access-token');

    // Returning it would make any write that bypassed the adapter a silent
    // plaintext-at-rest path.
    await expect(ctx.internalAdapter.findAccounts(user.id)).rejects.toThrow(
      SecretUnreadableError,
    );
  });

  it('re-seals the tokens an update did not touch when they are behind', async () => {
    // Sealed under a keyring whose only key is `test-2` ...
    const { account, accountId } = await signUpWithGoogle(
      testCipher(testKeyring(['test-2'])),
    );
    const before = await storedTokens(accountId);
    for (const column of TOKEN_COLUMNS) {
      expect(parseOAuthTokenKeyId(before[column]!)).toBe('test-2');
    }

    // ... then a key is prepended, so `test-1` is current and `test-2` stays
    // readable — the shape of a real rotation.
    const rotated = await contextFor(
      testCipher(testKeyring(['test-1', 'test-2'])),
    );
    await rotated.internalAdapter.updateAccount(account.id, {
      accessToken: 'a-refreshed-access-token',
    });

    // Every column moved to the current key, not just the one named: a row
    // carrying two key ids would make the rotation check read three columns
    // to decide whether it is done.
    const after = await storedTokens(accountId);
    for (const column of TOKEN_COLUMNS) {
      expect(parseOAuthTokenKeyId(after[column]!)).toBe('test-1');
    }

    const accounts = await rotated.internalAdapter.findAccounts(account.userId);
    expect(accounts[0]).toMatchObject({
      accessToken: 'a-refreshed-access-token',
      refreshToken: TOKENS.refreshToken,
      idToken: TOKENS.idToken,
    });
  });

  it('leaves an untouched token that is already current out of the patch', async () => {
    // better-auth's own `getAccessToken` refreshes a token by reading the row
    // and writing all three columns from that read, so the wrapper adds no
    // window in steady state. It would add one if it re-emitted columns the
    // caller never named from a snapshot of its own: a refresh committing
    // between the read and the write would be overwritten by a stale value.
    // Nothing is rewritten unless it has to be.
    const { ctx, account, accountId } = await signUpWithGoogle(testCipher());
    const before = await storedTokens(accountId);

    await ctx.internalAdapter.updateAccount(account.id, {
      accessToken: 'a-refreshed-access-token',
    });

    const after = await storedTokens(accountId);
    // Byte-identical, which a re-seal cannot be: sealing draws a fresh nonce,
    // so the same plaintext under the same key stores as different bytes.
    expect(after.refreshToken).toBe(before.refreshToken);
    expect(after.idToken).toBe(before.idToken);
    expect(after.accessToken).not.toBe(before.accessToken);

    const accounts = await ctx.internalAdapter.findAccounts(account.userId);
    expect(accounts[0]).toMatchObject({
      accessToken: 'a-refreshed-access-token',
      refreshToken: TOKENS.refreshToken,
      idToken: TOKENS.idToken,
    });
  });

  it('re-seals untouched tokens when the update moves the row identity', async () => {
    // The identity is bound into the ciphertext, so a token left as it was
    // would stop opening the moment the row it names changes underneath it.
    const { ctx, account, accountId } = await signUpWithGoogle(testCipher());
    const before = await storedTokens(accountId);
    const movedTo = randomUUID();

    await ctx.adapter.update({
      model: 'account',
      where: [{ field: 'id', value: account.id }],
      update: { accountId: movedTo },
    });

    const after = await storedTokens(movedTo);
    expect(after.refreshToken).not.toBe(before.refreshToken);
    const moved = await ctx.internalAdapter.findAccountByKey({
      issuer: GOOGLE.issuer,
      accountId: movedTo,
    });
    expect(moved).toMatchObject(TOKENS);
  });

  it('still sets a password, and leaves the credential row untouched', async () => {
    const ctx = await contextFor(testCipher());
    const email = `${randomUUID()}@example.com`;
    const user = await ctx.internalAdapter.createUser(
      { name: 'Researcher', email, emailVerified: true, image: null },
      { method: 'email-password' },
    );
    await ctx.internalAdapter.linkAccount({
      providerId: 'credential',
      issuer: CREDENTIAL_ISSUER,
      accountId: user.id,
      userId: user.id,
      password: 'the-first-scrypt-hash',
    });

    // updatePassword is better-auth's only bulk write to `account`; it must
    // pass straight through, because it names no token column.
    await ctx.internalAdapter.updatePassword(user.id, 'the-second-scrypt-hash');

    const credential = await ctx.internalAdapter.findCredentialAccount(user.id);
    expect(credential?.password).toBe('the-second-scrypt-hash');
    expect(await storedTokens(user.id)).toEqual({
      accessToken: null,
      refreshToken: null,
      idToken: null,
    });
  });

  it('refuses a bulk update that touches a token column', async () => {
    const ctx = await contextFor(testCipher());

    // Fails closed: each row seals under its own identity, so there is no one
    // value a bulk write could put in every row.
    await expect(
      ctx.adapter.updateMany({
        model: 'account',
        where: [{ field: 'providerId', value: GOOGLE.providerId }],
        update: { accessToken: 'one-value-for-every-row' },
      }),
    ).rejects.toThrow(/bulk write/);
  });
});
