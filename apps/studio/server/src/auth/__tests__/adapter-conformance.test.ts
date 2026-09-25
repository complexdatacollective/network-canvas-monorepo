import { randomBytes, randomUUID } from 'node:crypto';

import { PgClient } from '@effect/sql-pg';
import { BetterAuthError } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { memoryAdapter } from 'better-auth/adapters/memory';
import type { BetterAuthOptions, DBAdapter, Where } from 'better-auth/types';
import { getTableName } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Effect, Predicate } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import {
  openTestDatabase,
  ownerRows,
  type TestDatabaseRuntime,
  testDb,
} from '../../__tests__/support/database.ts';
import { testCipher } from '../../__tests__/support/secrets.ts';
import { AUTH_TABLES } from '../../db/auth-schema.ts';
import { Database } from '../../db/client.ts';
import type { AuthEnv } from '../../env.ts';
import { studioAuthAdapter } from '../adapter.ts';
import { createBetterAuthInstance } from '../better-auth.ts';
import { makeSqlBridge, type SqlBridge } from '../sql-bridge.ts';

// Conformance for `auth/adapter.ts` (#1927 §12, S6 §7 4.4). better-auth 1.7.5
// ships no adapter test kit, so it is proved two ways: differentially, against
// the published memory adapter driven through the same scripted operations
// with Studio's own options; and through a real better-auth instance, whose
// flows have to land in the physical tables of `db/auth-schema.ts`.

const ENV: AuthEnv = {
  baseUrl: 'http://studio.test',
  secret: randomBytes(32).toString('hex'),
  trustedProxies: undefined,
  socialProviders: {},
};

/** A bridge for the cases that must never reach a database. */
const unreachable = (): Promise<never> =>
  Promise.reject(new Error('this case reads no database'));
const REFUSING_BRIDGE: SqlBridge = {
  run: unreachable,
  transaction: unreachable,
};

type MagicLink = { readonly email: string; readonly url: string };

/**
 * Studio's instance over an adapter, and every magic link it would have sent.
 * The instance's own options are what both adapters in the differential are
 * built from, so the plugin set and the organization plugin's snake_case
 * mapping are the configured ones rather than a restatement.
 */
function instanceOver(adapter: (options: BetterAuthOptions) => DBAdapter) {
  const sent: MagicLink[] = [];
  const auth = createBetterAuthInstance({
    env: ENV,
    adapter,
    cipher: testCipher(),
    sendMagicLink: (link) => {
      sent.push(link);
      return Promise.resolve();
    },
  });
  return { auth, sent };
}

const STUDIO_OPTIONS: BetterAuthOptions = instanceOver(
  studioAuthAdapter(REFUSING_BRIDGE),
).auth.options;

describe('the better-auth instance Studio configures', () => {
  it('leaves joins and id generation to better-auth', () => {
    // The adapter throws on a `join` and never mints an id. Both hold only
    // while these stay unset: `joins` would start forwarding joins to it, and
    // `generateId` would move id minting (a `'serial'` is refused at
    // construction by `supportsNumericIds: false`).
    expect(STUDIO_OPTIONS.advanced?.database?.joins).toBeUndefined();
    expect(STUDIO_OPTIONS.advanced?.database?.generateId).toBeUndefined();
  });
});

/**
 * An answer as the comparison reads it: dates as instants, and a field that
 * came back `undefined` the same as one that came back `null` — the memory
 * adapter stores a row without the columns its create left out, where Postgres
 * stores `NULL`.
 */
function normal(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normal);
  if (Predicate.isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, field]): [string, unknown] => [key, normal(field)])
        .toSorted(([a], [b]) => a.localeCompare(b)),
    );
  }
  return value ?? null;
}

/** For an answer whose order the call did not ask for. */
function unordered(value: unknown): unknown {
  const answer = normal(value);
  return Array.isArray(answer)
    ? answer.toSorted((a, b) =>
        JSON.stringify(a).localeCompare(JSON.stringify(b)),
      )
    : answer;
}

const at = (day: number): Date =>
  new Date(Date.UTC(2026, 0, day, 12, 0, 0, 250));

/** Well past every case, so an expiry in the scripts never lapses mid-run. */
const LATER = new Date(Date.UTC(2099, 0, 1));

const user = (
  id: string,
  name: string,
  email: string,
  emailVerified: boolean,
  locale: string | null,
  day: number,
) => ({
  model: 'user',
  forceAllowId: true,
  data: {
    id,
    name,
    email,
    emailVerified,
    image: null,
    locale,
    createdAt: at(day),
    updatedAt: at(day),
  },
});

type Operation = {
  readonly label: string;
  readonly act: (adapter: DBAdapter) => Promise<unknown>;
  /** The call named an order; otherwise rows are compared as a set. */
  readonly ordered?: boolean;
};

const eq = (field: string, value: Where['value']): Where => ({ field, value });
const where = (
  field: string,
  operator: NonNullable<Where['operator']>,
  value: Where['value'],
  more: Partial<Where> = {},
): Where => ({ field, operator, value, ...more });

const findMany = (model: string, clauses: Where[]) => ({
  label: `findMany ${model} ${clauses
    .map(
      (clause) =>
        `${clause.connector ?? 'AND'} ${clause.field} ${clause.operator ?? 'eq'} ${JSON.stringify(clause.value)}${clause.mode === 'insensitive' ? ' (insensitive)' : ''}`,
    )
    .join(' ')}`,
  act: (adapter: DBAdapter) => adapter.findMany({ model, where: clauses }),
});

/**
 * The script: every method, every operator, the organization plugin's remapped
 * models and fields, in an order where each step's state is the one the
 * previous steps left.
 */
const SCRIPT: Operation[] = [
  // Fixtures, through `create`: what comes back is compared too.
  ...[
    user('u1', 'Ada Lovelace', 'ada@example.com', true, 'en', 1),
    user('u2', 'Bob_Builder', 'bob@example.com', false, null, 2),
    user('u3', 'carol 100%', 'Carol@Example.com', true, 'fr', 3),
    user('u4', 'dave\\path', 'dave@example.org', false, null, 4),
    user('u5', 'Eve', 'EVE@example.org', true, 'en', 5),
    user('u6', 'bobXbuilder', 'x@example.net', false, 'de', 6),
  ].map((call) => ({
    label: `create user ${call.data.id}`,
    act: (adapter: DBAdapter) => adapter.create(call),
  })),
  ...[
    { id: 't1', name: 'Alpha Team', slug: 'alpha', metadata: null, day: 1 },
    { id: 't2', name: 'Beta', slug: 'beta', metadata: '{"a":1}', day: 2 },
  ].map(({ day, ...data }) => ({
    label: `create organization ${data.id}`,
    act: (adapter: DBAdapter) =>
      adapter.create({
        model: 'organization',
        forceAllowId: true,
        data: { ...data, logo: null, createdAt: at(day) },
      }),
  })),
  ...[
    ['m1', 't1', 'u1', 'owner', 1],
    ['m2', 't1', 'u2', 'member', 2],
    ['m3', 't2', 'u1', 'admin', 3],
    ['m4', 't2', 'u3', 'member', 4],
  ].map(([id, organizationId, userId, role, day]) => ({
    label: `create member ${id}`,
    act: (adapter: DBAdapter) =>
      adapter.create({
        model: 'member',
        forceAllowId: true,
        data: { id, organizationId, userId, role, createdAt: at(Number(day)) },
      }),
  })),
  ...[
    ['i1', 't1', 'new@example.com', 'pending'],
    ['i2', 't2', 'Other@Example.com', 'pending'],
    ['i3', 't1', 'gone@example.com', 'rejected'],
  ].map(([id, organizationId, email, status]) => ({
    label: `create invitation ${id}`,
    act: (adapter: DBAdapter) =>
      adapter.create({
        model: 'invitation',
        forceAllowId: true,
        data: {
          id,
          organizationId,
          email,
          role: 'member',
          status,
          expiresAt: LATER,
          createdAt: at(7),
          inviterId: 'u1',
        },
      }),
  })),
  ...[
    ['s1', 'u1', 'tok-1', 't1'],
    ['s2', 'u2', 'tok-2', null],
  ].map(([id, userId, token, activeOrganizationId]) => ({
    label: `create session ${id}`,
    act: (adapter: DBAdapter) =>
      adapter.create({
        model: 'session',
        forceAllowId: true,
        data: {
          id,
          userId,
          token,
          activeOrganizationId,
          expiresAt: LATER,
          ipAddress: null,
          userAgent: null,
          createdAt: at(8),
          updatedAt: at(8),
        },
      }),
  })),
  ...[
    ['v1', 'shared', 1],
    ['v2', 'shared', 2],
    ['v3', 'single', 3],
  ].map(([id, identifier, day]) => ({
    label: `create verification ${id}`,
    act: (adapter: DBAdapter) =>
      adapter.create({
        model: 'verification',
        forceAllowId: true,
        data: {
          id,
          identifier,
          value: `value-${id}`,
          expiresAt: at(Number(day) + 10),
          createdAt: at(9),
          updatedAt: at(9),
        },
      }),
  })),
  {
    label: 'create account a1',
    act: (adapter) =>
      adapter.create({
        model: 'account',
        forceAllowId: true,
        data: {
          id: 'a1',
          accountId: 'u1',
          providerId: 'credential',
          userId: 'u1',
          password: 'a-scrypt-hash',
          accessToken: null,
          refreshToken: null,
          idToken: null,
          createdAt: at(9),
          updatedAt: at(9),
        },
      }),
  },

  // findOne
  {
    label: 'findOne user by email',
    act: (adapter) =>
      adapter.findOne({
        model: 'user',
        where: [eq('email', 'ada@example.com')],
      }),
  },
  {
    label: 'findOne user by email, insensitive',
    act: (adapter) =>
      adapter.findOne({
        model: 'user',
        where: [
          where('email', 'eq', 'carol@example.com', { mode: 'insensitive' }),
        ],
      }),
  },
  {
    label: 'findOne user with a select',
    act: (adapter) =>
      adapter.findOne({
        model: 'user',
        where: [eq('id', 'u3')],
        select: ['email', 'emailVerified'],
      }),
  },
  {
    label: 'findOne user that does not exist',
    act: (adapter) =>
      adapter.findOne({ model: 'user', where: [eq('email', 'nobody')] }),
  },
  {
    label: 'findOne member with a remapped select',
    act: (adapter) =>
      adapter.findOne({
        model: 'member',
        where: [eq('id', 'm3')],
        select: ['organizationId', 'userId'],
      }),
  },
  {
    label: 'findOne session by its remapped active team',
    act: (adapter) =>
      adapter.findOne({
        model: 'session',
        where: [eq('activeOrganizationId', 't1')],
      }),
  },
  {
    label: 'findOne invitation by email, insensitive',
    act: (adapter) =>
      adapter.findOne({
        model: 'invitation',
        where: [
          where('email', 'eq', 'other@example.com', { mode: 'insensitive' }),
        ],
      }),
  },

  // findMany: every operator
  findMany('user', [eq('locale', null)]),
  findMany('user', [where('locale', 'ne', null)]),
  findMany('user', [eq('emailVerified', true)]),
  findMany('user', [where('name', 'ne', 'Eve')]),
  findMany('user', [where('name', 'ne', 'eve', { mode: 'insensitive' })]),
  findMany('user', [where('id', 'in', ['u1', 'u3', 'u9'])]),
  findMany('user', [where('id', 'in', [])]),
  findMany('user', [where('id', 'not_in', ['u1', 'u2'])]),
  findMany('user', [where('id', 'not_in', [])]),
  findMany('user', [
    where('email', 'in', ['ADA@example.com', 'carol@example.com'], {
      mode: 'insensitive',
    }),
  ]),
  findMany('user', [
    where('email', 'not_in', ['EVE@EXAMPLE.ORG'], { mode: 'insensitive' }),
  ]),
  findMany('user', [where('name', 'contains', 'Bob')]),
  findMany('user', [where('name', 'contains', 'bob', { mode: 'insensitive' })]),
  // `_` and `%` are the caller's characters, not wildcards: the memory
  // adapter matches them literally, and so must this one.
  findMany('user', [where('name', 'contains', 'b_b', { mode: 'insensitive' })]),
  findMany('user', [where('name', 'contains', '100%')]),
  findMany('user', [where('name', 'ends_with', '\\path')]),
  findMany('user', [where('name', 'starts_with', 'Ada')]),
  findMany('user', [
    where('name', 'starts_with', 'ada', { mode: 'insensitive' }),
  ]),
  findMany('user', [where('name', 'starts_with', 'ada')]),
  findMany('user', [
    where('email', 'ends_with', '.ORG', { mode: 'insensitive' }),
  ]),
  findMany('user', [where('createdAt', 'gt', at(3))]),
  findMany('user', [where('createdAt', 'gte', at(3))]),
  findMany('user', [where('createdAt', 'lt', at(3))]),
  findMany('user', [where('createdAt', 'lte', at(3))]),
  // Mixed connectors, `OR` clauses first: the one order in which the memory
  // adapter's left fold and the drizzle grouping this adapter follows agree.
  // The grouping itself is asserted against the drizzle adapter below.
  findMany('user', [
    where('email', 'eq', 'ada@example.com', { connector: 'OR' }),
    where('email', 'eq', 'bob@example.com', { connector: 'OR' }),
    where('emailVerified', 'eq', true),
  ]),
  findMany('user', [
    where('name', 'eq', 'Eve', { connector: 'OR' }),
    where('locale', 'eq', 'fr', { connector: 'OR' }),
  ]),
  findMany('member', [eq('organizationId', 't1')]),
  findMany('invitation', [eq('organizationId', 't2'), eq('status', 'pending')]),
  {
    label: 'findMany member with a remapped select',
    act: (adapter) =>
      adapter.findMany({
        model: 'member',
        where: [eq('userId', 'u1')],
        select: ['organizationId', 'role'],
      }),
  },

  // Order, limit and offset
  {
    label: 'findMany user sorted by createdAt desc, limit 3',
    ordered: true,
    act: (adapter) =>
      adapter.findMany({
        model: 'user',
        sortBy: { field: 'createdAt', direction: 'desc' },
        limit: 3,
      }),
  },
  {
    label: 'findMany user sorted by createdAt asc, offset 2, limit 2',
    ordered: true,
    act: (adapter) =>
      adapter.findMany({
        model: 'user',
        sortBy: { field: 'createdAt', direction: 'asc' },
        offset: 2,
        limit: 2,
      }),
  },
  {
    label: 'findMany member sorted by its remapped createdAt, desc',
    ordered: true,
    act: (adapter) =>
      adapter.findMany({
        model: 'member',
        sortBy: { field: 'createdAt', direction: 'desc' },
      }),
  },
  {
    label: 'findMany invitation in t1 sorted by email',
    ordered: true,
    act: (adapter) =>
      adapter.findMany({
        model: 'invitation',
        where: [eq('organizationId', 't1')],
        sortBy: { field: 'email', direction: 'asc' },
      }),
  },

  // count
  { label: 'count user', act: (adapter) => adapter.count({ model: 'user' }) },
  {
    label: 'count user where emailVerified',
    act: (adapter) =>
      adapter.count({ model: 'user', where: [eq('emailVerified', true)] }),
  },
  {
    label: 'count member in t1',
    act: (adapter) =>
      adapter.count({ model: 'member', where: [eq('organizationId', 't1')] }),
  },

  // update, updateMany, incrementOne
  {
    label: 'update user u2',
    act: (adapter) =>
      adapter.update({
        model: 'user',
        where: [eq('id', 'u2')],
        update: { name: 'Bobby', updatedAt: at(20) },
      }),
  },
  {
    label: 'update a user that does not exist',
    act: (adapter) =>
      adapter.update({
        model: 'user',
        where: [eq('email', 'nobody')],
        update: { name: 'Nobody', updatedAt: at(20) },
      }),
  },
  {
    label: 'updateMany user where locale is null',
    act: (adapter) =>
      adapter.updateMany({
        model: 'user',
        where: [eq('locale', null)],
        update: { locale: 'es', updatedAt: at(21) },
      }),
  },
  findMany('user', [eq('locale', 'es')]),
  {
    label: 'update member m2 role, by a remapped where',
    act: (adapter) =>
      adapter.update({
        model: 'member',
        where: [eq('organizationId', 't1'), eq('userId', 'u2')],
        update: { role: 'admin' },
      }),
  },
  {
    label: 'updateMany invitation in t1',
    act: (adapter) =>
      adapter.updateMany({
        model: 'invitation',
        where: [eq('organizationId', 't1'), eq('status', 'pending')],
        update: { status: 'canceled' },
      }),
  },
  {
    label: 'incrementOne invitation i2 while pending',
    act: (adapter) =>
      adapter.incrementOne({
        model: 'invitation',
        where: [eq('id', 'i2'), eq('status', 'pending')],
        increment: {},
        set: { status: 'accepted' },
      }),
  },
  {
    label: 'incrementOne invitation i2 again: the guard fails',
    act: (adapter) =>
      adapter.incrementOne({
        model: 'invitation',
        where: [eq('id', 'i2'), eq('status', 'pending')],
        increment: {},
        set: { status: 'accepted' },
      }),
  },
  findMany('invitation', []),

  // consumeOne, delete, deleteMany
  {
    label: 'consumeOne racing itself over one row',
    act: async (adapter) =>
      unordered(
        await Promise.all([
          adapter.consumeOne({
            model: 'verification',
            where: [eq('identifier', 'single')],
          }),
          adapter.consumeOne({
            model: 'verification',
            where: [eq('identifier', 'single')],
          }),
        ]),
      ),
  },
  {
    label: 'consumeOne takes one of two matches',
    act: async (adapter) => {
      const consumed = await adapter.consumeOne({
        model: 'verification',
        where: [eq('identifier', 'shared')],
      });
      const left = await adapter.count({
        model: 'verification',
        where: [eq('identifier', 'shared')],
      });
      return { consumed: consumed !== null, left };
    },
  },
  {
    label: 'delete session by token',
    act: async (adapter) => {
      await adapter.delete({
        model: 'session',
        where: [eq('token', 'tok-2')],
      });
      return adapter.findMany({ model: 'session' });
    },
  },
  {
    label: 'delete with no where deletes nothing',
    act: async (adapter) => {
      await adapter.delete({ model: 'user', where: [] });
      return adapter.count({ model: 'user' });
    },
  },
  {
    label: 'deleteMany member in t2',
    act: (adapter) =>
      adapter.deleteMany({
        model: 'member',
        where: [eq('organizationId', 't2')],
      }),
  },
  {
    label: 'deleteMany verification expiring before a date',
    act: (adapter) =>
      adapter.deleteMany({
        model: 'verification',
        where: [where('expiresAt', 'lt', LATER)],
      }),
  },
  {
    label: 'count member',
    act: (adapter) => adapter.count({ model: 'member' }),
  },
  {
    label: 'count verification',
    act: (adapter) => adapter.count({ model: 'verification' }),
  },
  findMany('member', []),
];

/** The memory adapter's tables, keyed by the physical model names. */
const emptyMemory = () =>
  Object.fromEntries(
    Object.values(AUTH_TABLES).map((table) => [getTableName(table), []]),
  );

describe.skipIf(!testDb)(
  'the sql-pg adapter against the memory adapter',
  () => {
    let database: TestDatabaseRuntime | undefined;
    let studio: DBAdapter | undefined;
    let reference: DBAdapter | undefined;
    let bridge: SqlBridge | undefined;

    beforeAll(async () => {
      database = await openTestDatabase();
      bridge = await database.run(makeSqlBridge);
      studio = studioAuthAdapter(bridge)(STUDIO_OPTIONS);
      reference = memoryAdapter(emptyMemory())(STUDIO_OPTIONS);
    });

    afterAll(async () => {
      await database?.dispose();
    });

    for (const operation of SCRIPT) {
      it(`answers ${operation.label} as the memory adapter does`, async () => {
        if (!studio || !reference)
          throw new Error('the adapters were not built');
        const read = operation.ordered === true ? normal : unordered;
        const ours = read(await operation.act(studio));
        const theirs = read(await operation.act(reference));
        expect(ours).toEqual(theirs);
      });
    }

    it('counts a bigint column as a number, and increments it', async () => {
      if (!bridge) throw new Error('the bridge was not built');
      // `rateLimit` is declared but unused while the limiter counts in Valkey;
      // it is the one auth model with numeric columns, and `lastRequest` is
      // `int8`, which rc.115 decodes as a `bigint`.
      const options: BetterAuthOptions = {
        ...STUDIO_OPTIONS,
        rateLimit: { ...STUDIO_OPTIONS.rateLimit, storage: 'database' },
      };
      const adapters = [
        studioAuthAdapter(bridge)(options),
        memoryAdapter(emptyMemory())(options),
      ];
      const answers = await Promise.all(
        adapters.map(async (adapter) => {
          const key = 'rate-limit-key';
          await adapter.create({
            model: 'rateLimit',
            data: { key, count: 0, lastRequest: 1_790_000_000_000 },
          });
          const bumped = await adapter.incrementOne<Record<string, unknown>>({
            model: 'rateLimit',
            where: [eq('key', key), where('count', 'lt', 1)],
            increment: { count: 1 },
            set: { lastRequest: 1_790_000_000_001 },
          });
          const refused = await adapter.incrementOne({
            model: 'rateLimit',
            where: [eq('key', key), where('count', 'lt', 1)],
            increment: { count: 1 },
          });
          return normal({ bumped: { ...bumped, id: 'minted' }, refused });
        }),
      );
      expect(answers[0]).toEqual(answers[1]);
      expect(answers[0]).toMatchObject({
        bumped: { count: 1, lastRequest: 1_790_000_000_001 },
        refused: null,
      });
    });

    describe('where it deliberately differs', () => {
      /** Two members of one fresh team, each of them a plain member. */
      async function twoMembers(adapter: DBAdapter, team: string) {
        await adapter.create({
          model: 'organization',
          forceAllowId: true,
          data: { id: team, name: team, slug: team, createdAt: at(1) },
        });
        for (const [index, userId] of ['u1', 'u5'].entries()) {
          await adapter.create({
            model: 'member',
            forceAllowId: true,
            data: {
              id: `${team}-m${index}`,
              organizationId: team,
              userId,
              role: 'member',
              createdAt: at(index + 1),
            },
          });
        }
      }

      it('updates one row where the memory adapter updates every match', async () => {
        if (!studio || !reference)
          throw new Error('the adapters were not built');
        const promoted = await Promise.all(
          [studio, reference].map(async (adapter) => {
            await twoMembers(adapter, 'divergent-update');
            const updated = await adapter.update({
              model: 'member',
              where: [
                eq('organizationId', 'divergent-update'),
                eq('role', 'member'),
              ],
              update: { role: 'admin' },
            });
            expect(updated).not.toBeNull();
            return adapter.count({
              model: 'member',
              where: [
                eq('organizationId', 'divergent-update'),
                eq('role', 'admin'),
              ],
            });
          }),
        );
        // better-auth's contract: "Update a single row matching the where
        // clause". If a better-auth flow ever needs more, this is what fails.
        expect(promoted).toEqual([1, 2]);
      });

      it('matches `_` literally where the drizzle adapter reads a wildcard', async () => {
        if (!studio || !database)
          throw new Error('the adapters were not built');
        const drizzleOver = drizzleAdapter(
          drizzle({ client: database.appPool }),
          {
            provider: 'pg',
            schema: AUTH_TABLES,
          },
        )(STUDIO_OPTIONS);
        for (const [id, name] of [
          ['w1', 'snake_case'],
          ['w2', 'snakeXcase'],
        ] as const) {
          await studio.create(
            user(id, name, `${id}@example.com`, false, null, 10),
          );
        }
        const names = async (adapter: DBAdapter) =>
          (
            await adapter.findMany<{ name: string }>({
              model: 'user',
              where: [
                where('name', 'contains', 'E_C', { mode: 'insensitive' }),
              ],
            })
          )
            .map((row) => row.name)
            .toSorted();
        // `snakeXcase` is what an unescaped `_` matches.
        expect(await names(studio)).toEqual(['snake_case']);
        expect(await names(drizzleOver)).toEqual(['snakeXcase', 'snake_case']);
      });

      it('groups mixed connectors as the drizzle adapter does, whatever their order', async () => {
        if (!studio || !database)
          throw new Error('the adapters were not built');
        const drizzleOver = drizzleAdapter(
          drizzle({ client: database.appPool }),
          {
            provider: 'pg',
            schema: AUTH_TABLES,
          },
        )(STUDIO_OPTIONS);
        // `AND` first: the memory adapter folds left to `(a and a) or b or c`;
        // better-auth's callers assume `a and (b or c)`.
        const clauses: Where[] = [
          eq('emailVerified', true),
          where('email', 'eq', 'ada@example.com', { connector: 'OR' }),
          where('email', 'eq', 'bob@example.com', { connector: 'OR' }),
        ];
        const ids = async (adapter: DBAdapter) =>
          (
            await adapter.findMany<{ id: string }>({
              model: 'user',
              where: clauses,
            })
          )
            .map((row) => row.id)
            .toSorted();
        expect(await ids(studio)).toEqual(['u1']);
        expect(await ids(drizzleOver)).toEqual(['u1']);
      });
    });

    it('refuses a model or a column db/auth-schema.ts does not declare', async () => {
      if (!bridge) throw new Error('the bridge was not built');
      // A model better-auth knows but Studio's schema does not ...
      const renamed = studioAuthAdapter(bridge)({
        ...STUDIO_OPTIONS,
        rateLimit: { storage: 'database', modelName: 'rate_limits' },
      });
      await expect(
        renamed.findOne({ model: 'rateLimit', where: [eq('key', 'k')] }),
      ).rejects.toThrow(BetterAuthError);
      await expect(
        renamed.findOne({ model: 'rateLimit', where: [eq('key', 'k')] }),
      ).rejects.toThrow(/refuses the model "rate_limits"/);

      // ... and a field it knows that has no column: what an upgrade adding one
      // would look like.
      const widened = studioAuthAdapter(bridge)({
        ...STUDIO_OPTIONS,
        user: {
          ...STUDIO_OPTIONS.user,
          additionalFields: {
            ...STUDIO_OPTIONS.user?.additionalFields,
            favouriteColour: { type: 'string', required: false },
          },
        },
      });
      await expect(
        widened.create({
          model: 'user',
          data: {
            name: 'Refused',
            email: 'refused@example.com',
            emailVerified: false,
            favouriteColour: 'teal',
          },
        }),
      ).rejects.toThrow(/refuses the column "user.favouriteColour"/);
      await expect(
        widened.findOne({
          model: 'user',
          where: [eq('favouriteColour', 'teal')],
        }),
      ).rejects.toThrow(BetterAuthError);
      await expect(
        widened.findMany({
          model: 'user',
          where: [eq('id', 'u1')],
          select: ['favouriteColour'],
        }),
      ).rejects.toThrow(BetterAuthError);
    });

    it('refuses a join rather than ignoring it', async () => {
      if (!bridge) throw new Error('the bridge was not built');
      const joining = studioAuthAdapter(bridge)({
        ...STUDIO_OPTIONS,
        advanced: { ...STUDIO_OPTIONS.advanced, database: { joins: true } },
      });
      await expect(
        joining.findOne({
          model: 'user',
          where: [eq('id', 'u1')],
          join: { account: true },
        }),
      ).rejects.toThrow(/does not implement joins/);
    });
  },
);

/** The `cookie` header a browser would send back after `set-cookie`s. */
function cookieFrom(headers: Headers): Headers {
  const cookie = headers
    .getSetCookie()
    .map((line) => line.split(';')[0]!)
    .join('; ');
  return new Headers({ cookie });
}

describe.skipIf(!testDb)(
  'the sql-pg adapter under a real better-auth instance',
  () => {
    let database: TestDatabaseRuntime | undefined;
    let bridge: SqlBridge | undefined;

    beforeAll(async () => {
      database = await openTestDatabase();
      bridge = await database.run(makeSqlBridge);
    });

    afterAll(async () => {
      await database?.dispose();
    });

    function studioInstance() {
      if (!bridge) throw new Error('the bridge was not built');
      return instanceOver(studioAuthAdapter(bridge));
    }

    const rows = <A extends object>(
      statement: string,
      params: ReadonlyArray<unknown> = [],
    ) => {
      if (!database) throw new Error('the scratch schema was not provisioned');
      return database.run(ownerRows<A>(statement, params));
    };

    it('runs every statement as the application role, on the scratch schema', async () => {
      if (!bridge || !database) throw new Error('the bridge was not built');
      const who = PgClient.PgClient.use(
        (sql) =>
          sql<{ readonly role: string; readonly path: string }>`
          select current_user as role, current_setting('search_path') as path`,
      );
      const expected = [
        { role: TENANT_ROLES.app, path: database.harness.schema },
      ];
      expect(await bridge.run(who)).toEqual(expected);
      expect(await bridge.transaction((inner) => inner.run(who))).toEqual(
        expected,
      );
    });

    it('signs up, signs in, reads and ends a session', async () => {
      const { auth } = studioInstance();
      const email = `${randomUUID()}@example.com`;
      const signUp = await auth.api.signUpEmail({
        body: { name: 'Researcher', email, password: 'a long enough password' },
        returnHeaders: true,
      });
      const userId = signUp.response.user.id;

      expect(
        await rows(
          'select "email", "emailVerified", "locale" from "user" where "id" = $1',
          [userId],
        ),
      ).toEqual([{ email, emailVerified: false, locale: null }]);
      expect(
        await rows(
          'select "providerId", "accountId" from account where "userId" = $1',
          [userId],
        ),
      ).toEqual([{ providerId: 'credential', accountId: userId }]);

      const signIn = await auth.api.signInEmail({
        body: { email, password: 'a long enough password' },
        returnHeaders: true,
      });
      const headers = cookieFrom(signIn.headers);
      const session = await auth.api.getSession({ headers });
      expect(session?.user).toMatchObject({ id: userId, email, locale: null });
      expect(session?.user.createdAt).toBeInstanceOf(Date);
      expect(session?.session.expiresAt).toBeInstanceOf(Date);
      expect(
        await rows<{ n: number }>(
          'select count(*)::int as n from session where "userId" = $1',
          [userId],
        ),
      ).toEqual([{ n: 2 }]);

      await auth.api.signOut({ headers });
      expect(await auth.api.getSession({ headers })).toBeNull();
      expect(
        await rows<{ token: string }>(
          'select token from session where "id" = $1',
          [session?.session.id],
        ),
      ).toEqual([]);
    });

    it('sends a magic link and consumes it once', async () => {
      const { auth, sent } = studioInstance();
      const email = `${randomUUID()}@example.com`;
      await auth.api.signInMagicLink({
        body: { email },
        headers: new Headers(),
      });
      expect(sent).toHaveLength(1);
      const token = new URL(sent[0]!.url).searchParams.get('token');
      if (token === null) throw new Error('the magic link carries no token');
      // `storeToken: 'hashed'`: what is stored is not the token itself.
      expect(
        await rows('select 1 from verification where identifier = $1', [token]),
      ).toEqual([]);

      const verified = await auth.api.magicLinkVerify({
        query: { token },
        headers: new Headers(),
      });
      expect(verified.user).toMatchObject({ email, emailVerified: true });
      expect(
        await rows('select "emailVerified" from "user" where email = $1', [
          email,
        ]),
      ).toEqual([{ emailVerified: true }]);

      // Consumed: the same link does not sign anyone in twice.
      await expect(
        auth.api.magicLinkVerify({ query: { token }, headers: new Headers() }),
      ).rejects.toThrow();
    });

    it('creates a team, invites, accepts and changes a role through the remapped tables', async () => {
      const { auth } = studioInstance();
      const signUp = async (email: string) => {
        const result = await auth.api.signUpEmail({
          body: { name: email, email, password: 'a long enough password' },
          returnHeaders: true,
        });
        return {
          id: result.response.user.id,
          headers: cookieFrom(result.headers),
        };
      };
      const owner = await signUp(`${randomUUID()}@example.com`);
      const inviteeEmail = `${randomUUID()}@example.com`;
      const invitee = await signUp(inviteeEmail);

      const slug = `team-${randomUUID().slice(0, 8)}`;
      const team = await auth.api.createOrganization({
        body: { name: 'A Team', slug },
        headers: owner.headers,
      });
      if (!team) throw new Error('no team was created');
      expect(
        await rows('select name, slug from teams where id = $1', [team.id]),
      ).toEqual([{ name: 'A Team', slug }]);
      expect(
        await rows(
          'select user_id, role from team_members where team_id = $1',
          [team.id],
        ),
      ).toEqual([{ user_id: owner.id, role: 'owner' }]);
      // `activeOrganizationId` is `session.activeTeamId`.
      expect(
        await rows(
          'select distinct "activeTeamId" from session where "userId" = $1 and "activeTeamId" is not null',
          [owner.id],
        ),
      ).toEqual([{ activeTeamId: team.id }]);

      const invitation = await auth.api.createInvitation({
        body: { email: inviteeEmail, role: 'member', organizationId: team.id },
        headers: owner.headers,
      });
      expect(
        await rows(
          'select team_id, inviter_id, status from team_invitations where id = $1',
          [invitation.id],
        ),
      ).toEqual([
        { team_id: team.id, inviter_id: owner.id, status: 'pending' },
      ]);

      await auth.api.acceptInvitation({
        body: { invitationId: invitation.id },
        headers: invitee.headers,
      });
      expect(
        await rows('select status from team_invitations where id = $1', [
          invitation.id,
        ]),
      ).toEqual([{ status: 'accepted' }]);
      const [membership] = await rows<{ id: string; role: string }>(
        'select id, role from team_members where team_id = $1 and user_id = $2',
        [team.id, invitee.id],
      );
      expect(membership?.role).toBe('member');

      await auth.api.updateMemberRole({
        body: {
          memberId: membership!.id,
          role: 'admin',
          organizationId: team.id,
        },
        headers: owner.headers,
      });
      expect(
        await rows('select role from team_members where id = $1', [
          membership!.id,
        ]),
      ).toEqual([{ role: 'admin' }]);
    });

    describe('transactions, which Studio turns on here', () => {
      it('leaves no row behind when the callback fails', async () => {
        const { auth } = studioInstance();
        const context = await auth.$context;
        const email = `${randomUUID()}@example.com`;
        class Abandoned extends Error {}

        await expect(
          context.adapter.transaction(async (trx) => {
            const created = await trx.create<{ id: string }>({
              model: 'user',
              data: { name: 'Transient', email, emailVerified: false },
            });
            await trx.create({
              model: 'account',
              data: {
                accountId: created.id,
                providerId: 'credential',
                userId: created.id,
                password: 'a-scrypt-hash',
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            });
            // Written inside, so visible inside.
            expect(
              await trx.findOne({ model: 'user', where: [eq('email', email)] }),
            ).not.toBeNull();
            throw new Abandoned();
          }),
        ).rejects.toBeInstanceOf(Abandoned);

        expect(
          await rows('select 1 from "user" where email = $1', [email]),
        ).toEqual([]);
      });

      it('makes an OAuth sign-up atomic: a refused account takes its user with it', async () => {
        const { auth } = studioInstance();
        const context = await auth.$context;
        const accountId = randomUUID();
        const first = `${randomUUID()}@example.com`;
        await context.internalAdapter.createOAuthUser(
          { name: 'First', email: first, emailVerified: true, image: null },
          { providerId: 'google', accountId },
        );

        // The same Google identity again, for a new address: `createOAuthUser`
        // writes the user and then the account inside one `runWithTransaction`,
        // and the account violates `account_providerId_accountId_idx`. With
        // better-auth's as-is fallback the user would stay behind.
        const second = `${randomUUID()}@example.com`;
        await expect(
          context.internalAdapter.createOAuthUser(
            { name: 'Second', email: second, emailVerified: true, image: null },
            { providerId: 'google', accountId },
          ),
        ).rejects.toThrow();
        expect(
          await rows('select 1 from "user" where email = $1', [second]),
        ).toEqual([]);
        expect(
          await rows('select 1 from "user" where email = $1', [first]),
        ).toEqual([{ '?column?': 1 }]);
      });
    });

    it('lets exactly one of two racing guarded writes through', async () => {
      if (!database) throw new Error('the scratch schema was not provisioned');
      const harness = database.harness;
      // Two clients, so the two writes are genuinely concurrent: the suite's
      // application client has one connection.
      const [first, second] = await Promise.all([
        database.run(makeSqlBridge),
        database.run(
          Effect.provideService(makeSqlBridge, Database, harness.secondApp),
        ),
      ]);
      const adapters = [first, second].map((client) =>
        studioAuthAdapter(client)(STUDIO_OPTIONS),
      );
      const { auth } = studioInstance();
      const context = await auth.$context;
      const inviter = await context.internalAdapter.createUser(
        {
          name: 'Inviter',
          email: `${randomUUID()}@example.com`,
          emailVerified: true,
        },
        { method: 'email-password' },
      );
      const teamId = `race-${randomUUID().slice(0, 8)}`;
      await context.adapter.create({
        model: 'organization',
        forceAllowId: true,
        data: { id: teamId, name: teamId, slug: teamId, createdAt: new Date() },
      });
      const invitation = await context.adapter.create<{ id: string }>({
        model: 'invitation',
        data: {
          organizationId: teamId,
          email: 'raced@example.com',
          role: 'member',
          status: 'pending',
          expiresAt: LATER,
          createdAt: new Date(),
          inviterId: inviter.id,
        },
      });

      // Both writers read `pending` and then queue on the row lock the owner
      // holds, so both are past their sub-select before either may write. The
      // one that goes second must see the first one's `accepted` and write
      // nothing — which it does only if the guard is re-checked on the row it
      // finally locks.
      let release: () => void = () => undefined;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      let locked: () => void = () => undefined;
      const holding = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const holder = database.run(
        harness.onOwner(
          Effect.gen(function* () {
            yield* harness.owner
              .sql`select 1 from team_invitations where id = ${invitation.id} for update`;
            locked();
            yield* Effect.promise(() => released);
          }),
        ),
      );
      await holding;
      const racers = adapters.map((adapter) =>
        adapter.incrementOne({
          model: 'invitation',
          where: [eq('id', invitation.id), eq('status', 'pending')],
          increment: {},
          set: { status: 'accepted' },
        }),
      );
      for (let attempt = 0; ; attempt += 1) {
        const [waiting] = await rows<{ n: number }>(
          `select count(*)::int as n from pg_stat_activity
          where wait_event_type = 'Lock'
            and application_name in ('studio-test-app', 'studio-test-app-second')`,
        );
        if (waiting?.n === 2) break;
        if (attempt > 200) throw new Error('the two writers never queued');
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      release();
      await holder;
      const outcomes = await Promise.all(racers);
      expect(outcomes.filter((outcome) => outcome !== null)).toHaveLength(1);
    });
  },
);
