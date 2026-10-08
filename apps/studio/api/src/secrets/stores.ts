import { and, eq, isNotNull, like, ne, sql, type SQL } from 'drizzle-orm';
import { union, unionAll } from 'drizzle-orm/pg-core';
import { Effect, Option, type Redacted, Schema } from 'effect';
import type { SqlError } from 'effect/sql';

import { AUTH_TABLES } from '../db/auth-schema.ts';
import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';
import { PROTOCOL_BUILDER_TABLES } from '../protocol-builder/schema.ts';
import { PROTOCOL_TABLES } from '../protocol/schema.ts';
import { WEBHOOK_TABLES } from '../webhook/schema.ts';
import {
  type OAuthTokenColumn,
  sealedOAuthTokenPrefix,
  type SecretsCipherApi,
} from './cipher.ts';
import { SecretsCipher } from './services.ts';

// Every statement here runs inside the caller's transaction, which must be a
// MAINTENANCE one: the tenant tables force row-level security.
// Every span carries `sqlErrorsOnly`: the drizzle wrapper interpolates every
// bind parameter, here sealed ciphertext, into its message.

const { account } = AUTH_TABLES;
const { webhookSubscriptions } = WEBHOOK_TABLES;
const { protocolAssetKeys } = PROTOCOL_TABLES;
const { protocolStagedResources } = PROTOCOL_BUILDER_TABLES;

export type SecretOpener = (cipher: SecretsCipherApi) => Redacted.Redacted;

export type SecretStore = {
  name: string;
  /**
   * Exactly as stored: ids no keyring could hold are included, so the boot
   * check counts them.
   */
  keyIdsInUse: Effect.Effect<string[], SqlError.SqlError, Transaction>;
  probe(
    keyId: string,
  ): Effect.Effect<Option.Option<SecretOpener>, SqlError.SqlError, Transaction>;
  rotateBatch(
    batchSize: number,
  ): Effect.Effect<number, SqlError.SqlError, SecretsCipher | Transaction>;
  remaining(
    currentKeyId: string,
  ): Effect.Effect<number, SqlError.SqlError, Transaction>;
};

function reseal<T>(what: string, act: () => T): T {
  try {
    return act();
  } catch (error) {
    throw new Error(
      `${what} could not be re-sealed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/**
 * Without `.returning()`, `rows.length` would be `undefined` and every check on
 * it vacuous.
 */
function oneUpdatedRow(
  what: string,
  rows: readonly unknown[],
): Effect.Effect<void> {
  return rows.length === 1
    ? Effect.void
    : Effect.die(
        new Error(
          `${what}: the re-sealing update changed ${rows.length} rows, not 1`,
        ),
      );
}

/** `count(*)` is a bigint, which the codec decodes as a JavaScript `bigint`. */
const COUNT = sql<number>`count(*)::int`;

function countOf(rows: readonly { count: number }[]): number {
  return rows[0]?.count ?? 0;
}

const webhookSubscriptionsStore: SecretStore = {
  name: 'webhook_subscriptions',

  keyIdsInUse: Effect.fn('secrets.stores.webhookSubscriptions.keyIdsInUse')(
    function* () {
      const { tx } = yield* Transaction;
      const rows = yield* tx
        .selectDistinct({ keyId: webhookSubscriptions.secretKeyId })
        .from(webhookSubscriptions);
      return rows.map((row) => row.keyId);
    },
    sqlErrorsOnly,
  )(),

  probe: Effect.fn('secrets.stores.webhookSubscriptions.probe')(function* (
    keyId: string,
  ) {
    const { tx } = yield* Transaction;
    const rows = yield* tx
      .select({
        id: webhookSubscriptions.id,
        teamId: webhookSubscriptions.teamId,
        ciphertext: webhookSubscriptions.secretCiphertext,
      })
      .from(webhookSubscriptions)
      .where(eq(webhookSubscriptions.secretKeyId, keyId))
      .limit(1);
    const row = rows[0];
    if (row === undefined) return Option.none();
    return Option.some((cipher: SecretsCipherApi) =>
      cipher.openWebhookSecret(
        { teamId: row.teamId, subscriptionId: row.id },
        { ciphertext: row.ciphertext, keyId },
      ),
    );
  }, sqlErrorsOnly),

  remaining: Effect.fn('secrets.stores.webhookSubscriptions.remaining')(
    function* (currentKeyId: string) {
      const { tx } = yield* Transaction;
      const rows = yield* tx
        .select({ count: COUNT })
        .from(webhookSubscriptions)
        .where(ne(webhookSubscriptions.secretKeyId, currentKeyId));
      return countOf(rows);
    },
    sqlErrorsOnly,
  ),

  rotateBatch: Effect.fn('secrets.stores.webhookSubscriptions.rotateBatch')(
    function* (batchSize: number) {
      const cipher = yield* SecretsCipher;
      const { tx } = yield* Transaction;
      const rows = yield* tx
        .select({
          id: webhookSubscriptions.id,
          teamId: webhookSubscriptions.teamId,
          ciphertext: webhookSubscriptions.secretCiphertext,
          keyId: webhookSubscriptions.secretKeyId,
        })
        .from(webhookSubscriptions)
        .where(ne(webhookSubscriptions.secretKeyId, cipher.currentKeyId))
        .limit(batchSize)
        .for('update', { skipLocked: true });

      for (const row of rows) {
        const identity = { teamId: row.teamId, subscriptionId: row.id };
        const resealed = reseal(`webhook_subscriptions ${row.id}`, () =>
          cipher.resealWebhookSecret(identity, {
            ciphertext: row.ciphertext,
            keyId: row.keyId,
          }),
        );
        const updated = yield* tx
          .update(webhookSubscriptions)
          .set({
            secretCiphertext: resealed.ciphertext,
            secretKeyId: resealed.keyId,
          })
          .where(eq(webhookSubscriptions.id, row.id))
          .returning({ id: webhookSubscriptions.id });
        yield* oneUpdatedRow(`webhook_subscriptions ${row.id}`, updated);
      }
      return rows.length;
    },
    sqlErrorsOnly,
  ),
};

const OAUTH_COLUMNS = [
  'accessToken',
  'refreshToken',
  'idToken',
] as const satisfies readonly OAuthTokenColumn[];

const SEALED_PREFIX_PATTERN = 'studio-secret:%';

const ProbedColumn = Schema.Literals(OAUTH_COLUMNS);
const decodeProbedColumn = Schema.decodeUnknownSync(ProbedColumn);

/**
 * `left(col, length) <> prefix` rather than `NOT LIKE`: a key id may contain
 * `_`, which LIKE reads as any one character.
 */
export function notUnderCurrentKeySql(currentKeyId: string): SQL {
  const prefix = sealedOAuthTokenPrefix(currentKeyId);
  return sql.join(
    OAUTH_COLUMNS.map(
      (column) =>
        sql`(${account[column]} IS NOT NULL AND left(${account[column]}, ${prefix.length}) <> ${prefix})`,
    ),
    sql` OR `,
  );
}

const accountKeyIdsOf = (
  tx: Transaction['Service']['tx'],
  column: OAuthTokenColumn,
) =>
  tx
    .selectDistinct({
      keyId: sql<string>`split_part(${account[column]}, ':', 2)`.as('keyId'),
    })
    .from(account)
    .where(like(account[column], SEALED_PREFIX_PATTERN));

const accountProbeOf = (
  tx: Transaction['Service']['tx'],
  column: OAuthTokenColumn,
  prefix: string,
) =>
  tx
    .select({
      providerId: account.providerId,
      accountId: account.accountId,
      columnName: sql<string>`${column}::text`.as('columnName'),
      token: account[column],
    })
    .from(account)
    .where(eq(sql`left(${account[column]}, ${prefix.length})`, prefix));

const accountStore: SecretStore = {
  name: 'account',

  keyIdsInUse: Effect.fn('secrets.stores.account.keyIdsInUse')(function* () {
    const { tx } = yield* Transaction;
    // UNION, not UNION ALL: one id present in two columns is one id in use.
    const rows = yield* union(
      accountKeyIdsOf(tx, 'accessToken'),
      accountKeyIdsOf(tx, 'refreshToken'),
      accountKeyIdsOf(tx, 'idToken'),
    );
    return rows.map((row) => row.keyId);
  }, sqlErrorsOnly)(),

  probe: Effect.fn('secrets.stores.account.probe')(function* (keyId: string) {
    const prefix = sealedOAuthTokenPrefix(keyId);
    const { tx } = yield* Transaction;
    const rows = yield* unionAll(
      accountProbeOf(tx, 'accessToken', prefix),
      accountProbeOf(tx, 'refreshToken', prefix),
      accountProbeOf(tx, 'idToken', prefix),
    ).limit(1);
    const row = rows[0];
    if (row === undefined || row.token === null) return Option.none();
    const column = decodeProbedColumn(row.columnName);
    const token = row.token;
    return Option.some((cipher: SecretsCipherApi) =>
      cipher.openOAuthToken(
        { providerId: row.providerId, accountId: row.accountId, column },
        token,
      ),
    );
  }, sqlErrorsOnly),

  remaining: Effect.fn('secrets.stores.account.remaining')(function* (
    currentKeyId: string,
  ) {
    const { tx } = yield* Transaction;
    const rows = yield* tx
      .select({ count: COUNT })
      .from(account)
      .where(notUnderCurrentKeySql(currentKeyId));
    return countOf(rows);
  }, sqlErrorsOnly),

  rotateBatch: Effect.fn('secrets.stores.account.rotateBatch')(function* (
    batchSize: number,
  ) {
    const cipher = yield* SecretsCipher;
    const { tx } = yield* Transaction;
    const rows = yield* tx
      .select({
        id: account.id,
        providerId: account.providerId,
        accountId: account.accountId,
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        idToken: account.idToken,
      })
      .from(account)
      .where(notUnderCurrentKeySql(cipher.currentKeyId))
      .limit(batchSize)
      .for('update', { skipLocked: true });

    for (const row of rows) {
      const resealed = (column: OAuthTokenColumn): string | null => {
        const stored = row[column];
        if (stored === null) return null;
        // A plaintext token is a fault, not a value to encrypt on the way past.
        return reseal(`account ${row.id} ${column}`, () =>
          cipher.resealOAuthToken(
            {
              providerId: row.providerId,
              accountId: row.accountId,
              column,
            },
            stored,
          ),
        );
      };
      const updated = yield* tx
        .update(account)
        .set({
          accessToken: resealed('accessToken'),
          refreshToken: resealed('refreshToken'),
          idToken: resealed('idToken'),
        })
        .where(eq(account.id, row.id))
        .returning({ id: account.id });
      yield* oneUpdatedRow(`account ${row.id}`, updated);
    }
    return rows.length;
  }, sqlErrorsOnly),
};

const protocolAssetKeysStore: SecretStore = {
  name: 'protocol_asset_keys',

  keyIdsInUse: Effect.fn('secrets.stores.protocolAssetKeys.keyIdsInUse')(
    function* () {
      const { tx } = yield* Transaction;
      const rows = yield* tx
        .selectDistinct({ keyId: protocolAssetKeys.keyId })
        .from(protocolAssetKeys);
      return rows.map((row) => row.keyId);
    },
    sqlErrorsOnly,
  )(),

  probe: Effect.fn('secrets.stores.protocolAssetKeys.probe')(function* (
    keyId: string,
  ) {
    const { tx } = yield* Transaction;
    const rows = yield* tx
      .select({
        teamId: protocolAssetKeys.teamId,
        protocolId: protocolAssetKeys.protocolId,
        assetId: protocolAssetKeys.assetId,
        ciphertext: protocolAssetKeys.ciphertext,
      })
      .from(protocolAssetKeys)
      .where(eq(protocolAssetKeys.keyId, keyId))
      .limit(1);
    const row = rows[0];
    if (row === undefined) return Option.none();
    return Option.some((cipher: SecretsCipherApi) =>
      cipher.openAssetKey(
        {
          teamId: row.teamId,
          protocolId: row.protocolId,
          assetId: row.assetId,
        },
        { ciphertext: row.ciphertext, keyId },
      ),
    );
  }, sqlErrorsOnly),

  remaining: Effect.fn('secrets.stores.protocolAssetKeys.remaining')(function* (
    currentKeyId: string,
  ) {
    const { tx } = yield* Transaction;
    const rows = yield* tx
      .select({ count: COUNT })
      .from(protocolAssetKeys)
      .where(ne(protocolAssetKeys.keyId, currentKeyId));
    return countOf(rows);
  }, sqlErrorsOnly),

  rotateBatch: Effect.fn('secrets.stores.protocolAssetKeys.rotateBatch')(
    function* (batchSize: number) {
      const cipher = yield* SecretsCipher;
      const { tx } = yield* Transaction;
      const rows = yield* tx
        .select({
          teamId: protocolAssetKeys.teamId,
          protocolId: protocolAssetKeys.protocolId,
          assetId: protocolAssetKeys.assetId,
          ciphertext: protocolAssetKeys.ciphertext,
          keyId: protocolAssetKeys.keyId,
        })
        .from(protocolAssetKeys)
        .where(ne(protocolAssetKeys.keyId, cipher.currentKeyId))
        .limit(batchSize)
        .for('update', { skipLocked: true });

      for (const row of rows) {
        const identity = {
          teamId: row.teamId,
          protocolId: row.protocolId,
          assetId: row.assetId,
        };
        const what = `protocol_asset_keys ${row.protocolId} ${row.assetId}`;
        const resealed = reseal(what, () =>
          cipher.resealAssetKey(identity, {
            ciphertext: row.ciphertext,
            keyId: row.keyId,
          }),
        );
        const updated = yield* tx
          .update(protocolAssetKeys)
          .set({ ciphertext: resealed.ciphertext, keyId: resealed.keyId })
          .where(
            and(
              eq(protocolAssetKeys.teamId, row.teamId),
              eq(protocolAssetKeys.protocolId, row.protocolId),
              eq(protocolAssetKeys.assetId, row.assetId),
            ),
          )
          .returning({ assetId: protocolAssetKeys.assetId });
        yield* oneUpdatedRow(what, updated);
      }
      return rows.length;
    },
    sqlErrorsOnly,
  ),
};

const staged = protocolStagedResources;

/** Only a staged `apikey` row holds a secret; a staged file holds none. */
const stagedSecretUnder = (keyId: string) =>
  and(isNotNull(staged.secretCiphertext), eq(staged.secretKeyId, keyId));
const stagedSecretNotUnder = (keyId: string) =>
  and(isNotNull(staged.secretCiphertext), ne(staged.secretKeyId, keyId));

const protocolStagedResourcesStore: SecretStore = {
  name: 'protocol_staged_resources',

  keyIdsInUse: Effect.fn('secrets.stores.protocolStagedResources.keyIdsInUse')(
    function* () {
      const { tx } = yield* Transaction;
      const rows = yield* tx
        .selectDistinct({ keyId: staged.secretKeyId })
        .from(staged)
        .where(isNotNull(staged.secretKeyId));
      return rows.flatMap((row) => (row.keyId === null ? [] : [row.keyId]));
    },
    sqlErrorsOnly,
  )(),

  probe: Effect.fn('secrets.stores.protocolStagedResources.probe')(function* (
    keyId: string,
  ) {
    const { tx } = yield* Transaction;
    const rows = yield* tx
      .select({
        teamId: staged.teamId,
        draftId: staged.draftId,
        owner: staged.owner,
        resourceId: staged.resourceId,
        ciphertext: staged.secretCiphertext,
      })
      .from(staged)
      .where(stagedSecretUnder(keyId))
      .limit(1);
    const row = rows[0];
    if (row === undefined || row.ciphertext === null) return Option.none();
    const ciphertext = row.ciphertext;
    return Option.some((cipher: SecretsCipherApi) =>
      cipher.openStagedSecret(
        {
          teamId: row.teamId,
          draftId: row.draftId,
          owner: row.owner,
          resourceId: row.resourceId,
        },
        { ciphertext, keyId },
      ),
    );
  }, sqlErrorsOnly),

  remaining: Effect.fn('secrets.stores.protocolStagedResources.remaining')(
    function* (currentKeyId: string) {
      const { tx } = yield* Transaction;
      const rows = yield* tx
        .select({ count: COUNT })
        .from(staged)
        .where(stagedSecretNotUnder(currentKeyId));
      return countOf(rows);
    },
    sqlErrorsOnly,
  ),

  rotateBatch: Effect.fn('secrets.stores.protocolStagedResources.rotateBatch')(
    function* (batchSize: number) {
      const cipher = yield* SecretsCipher;
      const { tx } = yield* Transaction;
      const rows = yield* tx
        .select({
          teamId: staged.teamId,
          draftId: staged.draftId,
          owner: staged.owner,
          editId: staged.editId,
          resourceId: staged.resourceId,
          ciphertext: staged.secretCiphertext,
          keyId: staged.secretKeyId,
        })
        .from(staged)
        .where(stagedSecretNotUnder(cipher.currentKeyId))
        .limit(batchSize)
        .for('update', { skipLocked: true });

      for (const row of rows) {
        const what = `protocol_staged_resources ${row.draftId} ${row.resourceId}`;
        const { ciphertext, keyId } = row;
        if (ciphertext === null || keyId === null) {
          return yield* Effect.die(new Error(`${what}: no sealed secret`));
        }
        const resealed = reseal(what, () =>
          cipher.resealStagedSecret(
            {
              teamId: row.teamId,
              draftId: row.draftId,
              owner: row.owner,
              resourceId: row.resourceId,
            },
            { ciphertext, keyId },
          ),
        );
        const updated = yield* tx
          .update(staged)
          .set({
            secretCiphertext: resealed.ciphertext,
            secretKeyId: resealed.keyId,
          })
          .where(
            and(
              eq(staged.draftId, row.draftId),
              eq(staged.owner, row.owner),
              eq(staged.editId, row.editId),
              eq(staged.resourceId, row.resourceId),
            ),
          )
          .returning({ resourceId: staged.resourceId });
        yield* oneUpdatedRow(what, updated);
      }
      return rows.length;
    },
    sqlErrorsOnly,
  ),
};

export const SECRET_STORES: readonly SecretStore[] = [
  webhookSubscriptionsStore,
  accountStore,
  protocolAssetKeysStore,
  protocolStagedResourcesStore,
];
