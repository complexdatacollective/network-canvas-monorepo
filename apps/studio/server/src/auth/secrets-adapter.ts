import type { DBAdapter, DBTransactionAdapter } from 'better-auth/types';

import type {
  OAuthTokenColumn,
  OAuthTokenIdentity,
  SecretsCipher,
} from '../secrets/cipher.ts';

// better-auth owns the `account` table and stores OAuth tokens in plain `text`
// columns. Its own `account.encryptOAuthTokens` stays off (#1900): it seals
// with BETTER_AUTH_SECRET, which carries no key id, cannot be rotated, and
// binds the ciphertext to nothing — a value copied between rows would still
// open. Studio seals them here instead, in a wrapper around the adapter, so
// every better-auth path above this line (routes, plugins, the internal
// adapter) keeps handling plaintext while the database only ever holds sealed
// values.
//
// The adapter is the seam rather than better-auth's `databaseHooks`, which do
// not cover reads: a hook could seal on the way in, but nothing would open on
// the way out, and the join in `findUserByEmail(..., { includeAccounts })` has
// no hook at all.

const ACCOUNT_MODEL = 'account';

/**
 * The three columns §6 covers. `password` is deliberately not among them: it
 * is a scrypt hash better-auth verifies against, not a secret anything reads
 * back.
 */
const TOKEN_COLUMNS: readonly OAuthTokenColumn[] = [
  'accessToken',
  'refreshToken',
  'idToken',
];

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The identity a token is sealed under. Read from the row rather than passed
 * in, because that is what a later read has to work from: whatever ends up in
 * `providerId`/`accountId` is what the value will be opened with.
 *
 * Throwing when they are absent is the fail-closed direction — a `select` that
 * projected a token column without its identity would otherwise be a silent
 * path to writing or returning an unsealed value.
 */
function identityFrom(
  source: Row,
  column: OAuthTokenColumn,
): OAuthTokenIdentity {
  const { providerId, accountId } = source;
  if (typeof providerId !== 'string' || typeof accountId !== 'string') {
    throw new Error(
      `Studio cannot seal or open ${ACCOUNT_MODEL}.${column}: the row does not carry both providerId and accountId.`,
    );
  }
  return { providerId, accountId, column };
}

/**
 * The column's text, or `undefined` for the null/absent case that passes
 * through untouched — which is every token column of the `credential`
 * provider's row, the one password sign-in uses.
 */
function tokenText(
  value: unknown,
  column: OAuthTokenColumn,
): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new TypeError(
      `${ACCOUNT_MODEL}.${column} must be text; received ${typeof value}.`,
    );
  }
  return value;
}

function touchesTokens(update: unknown): boolean {
  return isRow(update) && TOKEN_COLUMNS.some((column) => column in update);
}

/**
 * Opens every sealed token on an adapter result, in place. Mutating rather
 * than rebuilding keeps the caller's generic result type intact, and the rows
 * were just materialised by the adapter below, so nothing else holds them.
 *
 * `join: { account: true }` nests account rows under better-auth's own model
 * name whatever the base model is (`findUserByEmail(..., { includeAccounts })`
 * is the live caller), and those rows came out of the same columns.
 */
function openResult(
  value: unknown,
  model: string,
  cipher: SecretsCipher,
): void {
  if (Array.isArray(value)) {
    for (const item of value) openResult(item, model, cipher);
    return;
  }
  if (!isRow(value)) return;
  if (model === ACCOUNT_MODEL) {
    for (const column of TOKEN_COLUMNS) {
      const stored = tokenText(value[column], column);
      if (stored === undefined) continue;
      // A value that does not open is never handed back as it stands: the
      // cipher's SecretUnreadableError propagates, so a row written around
      // this adapter fails loudly rather than returning a stored string as
      // though it were a bearer token.
      value[column] = cipher.openOAuthToken(
        identityFrom(value, column),
        stored,
      );
    }
    return;
  }
  if (ACCOUNT_MODEL in value) {
    openResult(value[ACCOUNT_MODEL], ACCOUNT_MODEL, cipher);
  }
}

type Operations = Pick<
  DBTransactionAdapter,
  | 'create'
  | 'update'
  | 'updateMany'
  | 'findOne'
  | 'findMany'
  | 'consumeOne'
  | 'incrementOne'
>;

/**
 * The argument shapes, read off better-auth's own signatures rather than
 * restated. None of them mentions the method's row type parameter, so
 * instantiating it here is lossless — and every read below has to name that
 * parameter explicitly, because `await` gives inference nothing to work from
 * and would otherwise erase the caller's row type to `unknown`.
 */
type FindOneArgs = Parameters<DBTransactionAdapter['findOne']>[0];
type FindManyArgs = Parameters<DBTransactionAdapter['findMany']>[0];
type UpdateArgs = Parameters<DBTransactionAdapter['update']>[0];
type ConsumeOneArgs = Parameters<DBTransactionAdapter['consumeOne']>[0];
type IncrementOneArgs = Parameters<DBTransactionAdapter['incrementOne']>[0];

/**
 * A copy of the row to be created, with every token sealed; the row itself for
 * any other model. Generic in the caller's own row type and returning exactly
 * that type, and it takes the model rather than leaving a branch at the call
 * site, so `create` delegates through a single expression whose type is
 * indistinguishable from the one it was given — which is what lets better-auth
 * still infer its declared result type there.
 */
function sealedCreateData<D extends object>(
  model: string,
  source: D,
  cipher: SecretsCipher,
): D {
  if (model !== ACCOUNT_MODEL || !isRow(source)) return source;
  const sealed: D = { ...source };
  for (const column of TOKEN_COLUMNS) {
    const token = tokenText(source[column], column);
    if (token === undefined) continue;
    Object.assign(sealed, {
      [column]: cipher.sealOAuthToken(identityFrom(source, column), token),
    });
  }
  return sealed;
}

function wrapOperations(
  inner: DBTransactionAdapter,
  cipher: SecretsCipher,
): Operations {
  /**
   * Both bulk paths fail closed for the same reason: a token is sealed under
   * the identity of the single row that holds it, so there is no one value
   * that can be written across a set of rows. better-auth's only bulk write to
   * `account` is `updatePassword`, which touches `password` alone.
   */
  const refuseBulk = (): never => {
    throw new Error(
      `Studio refuses a bulk write to ${ACCOUNT_MODEL} OAuth tokens: each row seals its tokens under its own identity, so no single value can be written across rows.`,
    );
  };

  return {
    // `create` is the one method whose result type better-auth lets a caller
    // pick separately from the row type, and inference cannot carry that
    // through a wrapper, so both parameters are named and forwarded by hand.
    create: async <T extends Record<string, unknown>, R = T>(data: {
      model: string;
      data: Omit<T, 'id'>;
      select?: string[] | undefined;
      forceAllowId?: boolean | undefined;
    }): Promise<R> => {
      const created = await inner.create<T, R>({
        ...data,
        data: sealedCreateData(data.model, data.data, cipher),
      });
      // Opened again on the way out so the boundary is symmetrical: whatever
      // better-auth receives from the adapter is plaintext, whichever method
      // produced it. `linkAccount` hands its result straight back to the
      // caller of the link route.
      openResult(created, data.model, cipher);
      return created;
    },

    update: async <T>(data: UpdateArgs): Promise<T | null> => {
      if (data.model !== ACCOUNT_MODEL || !touchesTokens(data.update)) {
        const updated = await inner.update<T>(data);
        openResult(updated, data.model, cipher);
        return updated;
      }
      // A partial update carries neither the row's identity nor the tokens it
      // leaves alone, so the row is read first. Every token then present is
      // written back under the CURRENT key — not only the ones the caller
      // named — so a row never spans two keys and the rotation check can read
      // one key id per row rather than three.
      const existing = await inner.findOne<Row>({
        model: ACCOUNT_MODEL,
        where: data.where,
      });
      // No row to seal against. Returning null is what the delegated update
      // would answer for a `where` matching nothing, and is the fail-closed
      // answer to the race where a row appears in between: a missed update,
      // never a plaintext write.
      if (!isRow(existing)) return null;

      const patch: Row = { ...data.update };
      // Sealing uses the identity the row will have once this update lands,
      // because that is what the next read will open it with.
      const after: Row = { ...existing, ...patch };
      for (const column of TOKEN_COLUMNS) {
        let plaintext: string | undefined;
        if (column in patch) {
          plaintext = tokenText(patch[column], column);
          // An explicit null clears the column; there is nothing to seal.
          if (plaintext === undefined) continue;
        } else {
          const stored = tokenText(existing[column], column);
          if (stored === undefined) continue;
          // Opened under the identity the row carries now and re-sealed under
          // the one it will carry, so an identity change cannot strand a token
          // this update never touched.
          plaintext = cipher.openOAuthToken(
            identityFrom(existing, column),
            stored,
          );
        }
        patch[column] = cipher.sealOAuthToken(
          identityFrom(after, column),
          plaintext,
        );
      }
      const updated = await inner.update<T>({ ...data, update: patch });
      openResult(updated, data.model, cipher);
      return updated;
    },

    // `async` so the refusal arrives as a rejected promise like every other
    // failure from an adapter method, rather than as a synchronous throw a
    // caller's `.catch` would miss.
    updateMany: async (data) => {
      if (data.model === ACCOUNT_MODEL && touchesTokens(data.update)) {
        refuseBulk();
      }
      return inner.updateMany(data);
    },

    findOne: async <T>(data: FindOneArgs): Promise<T | null> => {
      const row = await inner.findOne<T>(data);
      openResult(row, data.model, cipher);
      return row;
    },

    findMany: async <T>(data: FindManyArgs): Promise<T[]> => {
      const rows = await inner.findMany<T>(data);
      openResult(rows, data.model, cipher);
      return rows;
    },

    // Neither runs against `account` today; both return or write rows, so they
    // are covered here rather than left as a gap for a later plugin to find.
    consumeOne: async <T>(data: ConsumeOneArgs): Promise<T | null> => {
      const row = await inner.consumeOne<T>(data);
      openResult(row, data.model, cipher);
      return row;
    },

    incrementOne: async <T>(data: IncrementOneArgs): Promise<T | null> => {
      if (data.model === ACCOUNT_MODEL && touchesTokens(data.set)) {
        refuseBulk();
      }
      const row = await inner.incrementOne<T>(data);
      openResult(row, data.model, cipher);
      return row;
    },
  };
}

/**
 * Wraps a built adapter so `account`'s OAuth tokens are sealed on the way into
 * the database and opened on the way out. Everything it does not touch is
 * forwarded, including members better-auth adds later.
 */
export function withSecretsAdapter(
  inner: DBAdapter,
  cipher: SecretsCipher,
): DBAdapter {
  return {
    ...inner,
    ...wrapOperations(inner, cipher),
    // A transaction hands out a second adapter, and better-auth's
    // `runWithTransaction` makes THAT one the adapter for everything inside —
    // including `handleOAuthUserInfo`, which creates the account row for a
    // first OAuth sign-in. Left unwrapped, the tokens that matter most would
    // be the ones written in the clear.
    transaction: (callback) =>
      inner.transaction((trx) =>
        callback({ ...trx, ...wrapOperations(trx, cipher) }),
      ),
  };
}
