import { randomUUID } from 'node:crypto';

import type { DBAdapter, DBTransactionAdapter } from 'better-auth/adapters';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { BetterAuthOptions } from 'better-auth/types';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';

import { AUTH_RUNTIME_TABLES } from '../db/auth-schema.ts';
import type { EncryptionKeys } from '../pii/keys.ts';
import {
  appendCredentialAudit,
  credentialTransaction,
  OAUTH_FIELDS,
  type OAuthIdentity,
  readOAuthFields,
  sealOAuthFields,
} from '../pii/oauth.ts';
import { ProtectedDataError } from '../pii/protection.ts';

type CreateInput<T> = Omit<Parameters<DBAdapter['create']>[0], 'data'> & {
  data: Omit<T, 'id'>;
};
type FindOneInput = Parameters<DBAdapter['findOne']>[0];
type FindManyInput = Parameters<DBAdapter['findMany']>[0];
type UpdateInput = Parameters<DBAdapter['update']>[0];

function identityOf(row: unknown): OAuthIdentity {
  if (row === null || typeof row !== 'object') throw new ProtectedDataError();
  const id: unknown = Reflect.get(row, 'id');
  const userId: unknown = Reflect.get(row, 'userId');
  if (typeof id !== 'string' || typeof userId !== 'string' || !id || !userId)
    throw new ProtectedDataError();
  return { id, userId };
}

function tokenMutation(data: Record<string, unknown>): boolean {
  return OAUTH_FIELDS.some(({ field }) => data[field] !== undefined);
}

function forbidStorageOverrides(data: Record<string, unknown>): void {
  if (
    OAUTH_FIELDS.some(
      ({ keyId, algorithm }) => keyId in data || algorithm in data,
    ) ||
    [
      'legacyAccessToken',
      'legacyRefreshToken',
      'legacyIdToken',
      'legacyTokensPresent',
    ].some((field) => field in data)
  )
    throw new ProtectedDataError();
}

const SUPPORT_FIELDS = [
  'id',
  'userId',
  ...OAUTH_FIELDS.flatMap(({ keyId, algorithm }) => [keyId, algorithm]),
];
function withMetadata(select: string[] | undefined): string[] | undefined {
  return select ? [...new Set([...select, ...SUPPORT_FIELDS])] : undefined;
}

/**
 * The single Better Auth persistence boundary. Plaintext never reaches the
 * Drizzle adapter for tokens, and no returned credential escapes before its
 * immutable audit commits. Password hashes and session tokens retain Better
 * Auth's own contract; these are distinct from reversible provider secrets.
 */
export function encryptedAuthAdapter(pool: pg.Pool, keys?: EncryptionKeys) {
  return (options: BetterAuthOptions): DBAdapter => {
    const baseFor = (client: pg.Pool | pg.PoolClient) =>
      drizzleAdapter(drizzle({ client }), {
        provider: 'pg',
        schema: AUTH_RUNTIME_TABLES,
      })(options);
    const base = baseFor(pool);

    async function hydrate<T>(
      model: string,
      row: T,
      select?: string[],
    ): Promise<T> {
      if (row === null || typeof row !== 'object') return row;
      if (model === 'account') return readOAuthFields(pool, keys, row, select);
      // Better Auth's includeAccounts query joins through the base adapter.
      // Its nested account results must cross the same boundary too.
      const accounts: unknown = Reflect.get(row, 'account');
      if (Array.isArray(accounts)) {
        const records: unknown[] = accounts;
        return Object.assign({}, row, {
          account: await Promise.all(
            records.map((account) => readOAuthFields(pool, keys, account)),
          ),
        });
      }
      if (accounts !== undefined && accounts !== null)
        return Object.assign({}, row, {
          account: await readOAuthFields(pool, keys, accounts),
        });
      return row;
    }

    // account_audit_deletion covers delete/deleteMany and user FK cascades
    // in their deleting SQL statement. Do not append a second adapter audit.
    const secure: DBAdapter = {
      ...base,
      async create<T extends Record<string, unknown>, R = T>(
        input: CreateInput<T>,
      ): Promise<R> {
        if (input.model !== 'account') return base.create<T, R>(input);
        forbidStorageOverrides(input.data);
        if (!tokenMutation(input.data)) return base.create<T, R>(input);
        if (!keys) throw new ProtectedDataError();
        const identity = identityOf({
          ...input.data,
          id: input.data.id ?? randomUUID(),
        });
        const sealed = sealOAuthFields(keys, identity, {
          ...input.data,
          id: identity.id,
        });
        const data = Object.assign({}, input.data, sealed);
        const row = await credentialTransaction(pool, async (client) => {
          const created = await baseFor(client).create<T, R>({
            ...input,
            data,
            select: undefined,
            forceAllowId: true,
          });
          await appendCredentialAudit(client, identity, 'write', randomUUID());
          return created;
        });
        return hydrate('account', row, input.select);
      },
      async findOne<T>(input: FindOneInput): Promise<T | null> {
        const row = await base.findOne<T>({
          ...input,
          select:
            input.model === 'account'
              ? withMetadata(input.select)
              : input.select,
        });
        return hydrate(input.model, row, input.select);
      },
      async findMany<T>(input: FindManyInput): Promise<T[]> {
        const rows = await base.findMany<T>({
          ...input,
          select:
            input.model === 'account'
              ? withMetadata(input.select)
              : input.select,
        });
        return Promise.all(
          rows.map((row) => hydrate(input.model, row, input.select)),
        );
      },
      async update<T>(input: UpdateInput): Promise<T | null> {
        if (input.model !== 'account') return base.update<T>(input);
        forbidStorageOverrides(input.update);
        // Moving an account changes its authenticated key/AAD scope; it must
        // use a deliberate transfer operation, never a generic adapter patch.
        if ('id' in input.update || 'userId' in input.update)
          throw new ProtectedDataError();
        if (!tokenMutation(input.update))
          return hydrate('account', await base.update<T>(input));
        if (!keys) throw new ProtectedDataError();
        const row = await credentialTransaction(pool, async (client) => {
          const local = baseFor(client);
          const old = await local.findOne<Record<string, unknown>>({
            model: 'account',
            where: input.where,
          });
          if (!old) return null;
          const identity = identityOf(old);
          const locked = await client.query(
            'SELECT id FROM account WHERE id = $1 AND "userId" = $2 FOR UPDATE',
            [identity.id, identity.userId],
          );
          if (!locked.rowCount) throw new ProtectedDataError();
          const updated = await local.update<T>({
            ...input,
            where: [{ field: 'id', value: identity.id }],
            update: sealOAuthFields(keys, identity, input.update),
          });
          await appendCredentialAudit(client, identity, 'write', randomUUID());
          return updated;
        });
        return hydrate('account', row);
      },
      async updateMany(input) {
        if (input.model === 'account') {
          forbidStorageOverrides(input.update);
          if (
            tokenMutation(input.update) ||
            'id' in input.update ||
            'userId' in input.update
          )
            throw new ProtectedDataError();
        }
        return base.updateMany(input);
      },
      async consumeOne(input) {
        if (input.model === 'account') throw new ProtectedDataError();
        return base.consumeOne(input);
      },
      async incrementOne(input) {
        if (input.model === 'account') throw new ProtectedDataError();
        return base.incrementOne(input);
      },
      // Preserve the existing Drizzle adapter's disabled multi-operation
      // transaction mode. Passing its raw callback through would bypass this
      // boundary. Each credential operation has its own real SQL transaction.
      async transaction<R>(
        callback: (adapter: DBTransactionAdapter) => Promise<R>,
      ): Promise<R> {
        return callback(secure);
      },
    };
    return secure;
  };
}
