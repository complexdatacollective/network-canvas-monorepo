import { and, eq, like, ne, sql, type SQL } from 'drizzle-orm';
import { union, unionAll } from 'drizzle-orm/pg-core';
import { Effect, Schema } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import { AUTH_TABLES } from '../db/auth-schema.ts';
import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';
import { PROTOCOL_TABLES } from '../protocol/schema.ts';
import { WEBHOOK_TABLES } from '../webhook/schema.ts';
import {
  type OAuthTokenColumn,
  sealedOAuthTokenPrefix,
  type SecretsCipherApi,
} from './cipher.ts';

// Every place a secret is stored, as one entry each (#1900). The boot check
// and the rotation command both walk this list rather than naming tables
// themselves, so a new store is added in one place and is immediately both
// verified at boot and rotated — the failure a registry exists to prevent is a
// store that rotation forgets and that therefore pins an old key forever.
//
// Every statement here runs inside the caller's transaction, which must be a
// MAINTENANCE one: the tenant tables force row-level security, so any other
// role sees only the team its transaction named, and a check that saw one
// team's rows would pass while another team's key was missing.
//
// Every span carries `sqlErrorsOnly`, and that is not decoration here more
// than anywhere else — it is the module the unwrap exists for. The drizzle
// builder re-raises a statement failure with the query text AND every bind
// parameter interpolated into its own message, and the bind parameters of
// these statements are sealed ciphertext and token material. Unwrapping to the
// `SqlError` underneath keeps the SQLSTATE and leaves the parameter dump out.

const { account } = AUTH_TABLES;
const { webhookSubscriptions } = WEBHOOK_TABLES;
const { protocolAssetKeys } = PROTOCOL_TABLES;

/**
 * Opens one stored secret with the given cipher, throwing the cipher's own
 * `SecretUnreadableError` when it will not open. What `probe` hands the boot
 * check, so that each store keeps the knowledge of which identity its rows are
 * sealed under and which open function reads them.
 */
export type SecretOpener = (cipher: SecretsCipherApi) => string;

export type SecretStore = {
  /** The table, which is what the rotation's counts are keyed and printed by. */
  name: string;
  /**
   * Distinct key ids the stored rows were sealed under, exactly as stored. Ids
   * that no keyring could hold are INCLUDED: the boot check counts them (never
   * printing the text, which came out of a column), because dropping them made
   * a database of rows nothing can open pass the check that exists to catch
   * exactly that.
   */
  keyIdsInUse: Effect.Effect<string[], SqlError.SqlError, Transaction>;
  /**
   * One stored secret sealed under `keyId`, ready to open, or null when this
   * store has none. The boot check opens one per (store, key id) so that a
   * keyring naming the right ids under the WRONG material is refused before
   * the deployment serves anything.
   */
  probe(
    keyId: string,
  ): Effect.Effect<SecretOpener | null, SqlError.SqlError, Transaction>;
  /**
   * Re-seals up to `batchSize` rows that are not under the current key and
   * returns how many were changed; zero means this store is finished. Runs
   * inside the caller's transaction, and takes the rows it works with
   * `FOR UPDATE SKIP LOCKED` so a second runner (or a request writing the same
   * row) never waits on it.
   *
   * The loop opens no nested scope. A savepoint per row would be
   * `SAVEPOINT effect_sql_<depth>` on the same connection with no `RELEASE` on
   * success, so a batch of a hundred rows would leave a hundred subtransactions
   * standing until the transaction ended.
   */
  rotateBatch(
    cipher: SecretsCipherApi,
    batchSize: number,
  ): Effect.Effect<number, SqlError.SqlError, Transaction>;
  /**
   * How many rows are still not under `currentKeyId`. The rotation's
   * postcondition: a batch returning zero means "nothing I could take", not
   * "nothing left" — `FOR UPDATE SKIP LOCKED` steps over a row another session
   * holds — so the loop ending is not proof the store is done.
   */
  remaining(
    currentKeyId: string,
  ): Effect.Effect<number, SqlError.SqlError, Transaction>;
};

/**
 * Adds the row to a re-sealing failure. The row's id is not a secret and is
 * the only thing that turns "a stored secret could not be read" into something
 * an operator can act on; the cipher's own message never carries more.
 *
 * Thrown rather than failed: a value that will not open under the key it names
 * is a defect (src/secrets/cipher.ts), and a throw inside these generators is
 * exactly that — it aborts the batch, nothing commits, and a person looks at
 * the row.
 */
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
 * The single row a re-sealing UPDATE must have changed.
 *
 * `.returning()` is not decoration: a write without it answers with the
 * driver's own result object, which is typed as a row array and is not one —
 * so `rows.length` would be `undefined` and every check on it vacuous. With
 * it, a re-seal whose predicate stopped naming the row it locked is a refusal
 * rather than a batch that reports `n` rows re-sealed and changes nothing.
 *
 * `what` is the row's identifiers, never its contents.
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
    if (row === undefined) return null;
    // `bytea` decodes as a `Uint8Array` rather than as node's `Buffer`, which
    // is exactly the wider shape `StoredSecret` names.
    return (cipher: SecretsCipherApi) =>
      cipher.openWebhookSecret(
        { teamId: row.teamId, subscriptionId: row.id },
        { ciphertext: row.ciphertext, keyId },
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
    function* (cipher: SecretsCipherApi, batchSize: number) {
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
        // `updated_at` is deliberately left alone: rotation changes how a row
        // is stored, not when the subscription was last changed by anyone.
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

/**
 * better-auth's `account` table, whose three token columns hold
 * `studio-secret:<keyId>:<base64url>` strings rather than a ciphertext and a
 * key id of their own (better-auth types them as `text`). `split_part(col, ':',
 * 2)` reads the same id `parseOAuthTokenKeyId` does, because a key id can
 * never contain a `:`.
 */
const OAUTH_COLUMNS = [
  'accessToken',
  'refreshToken',
  'idToken',
] as const satisfies readonly OAuthTokenColumn[];

const SEALED_PREFIX_PATTERN = 'studio-secret:%';

/** Which of the three columns a probed token came out of. */
const ProbedColumn = Schema.Literals(OAUTH_COLUMNS);
const decodeProbedColumn = Schema.decodeUnknownSync(ProbedColumn);

/**
 * "This row holds a token that is not sealed under the current key", as one
 * predicate every statement that needs it is written from.
 *
 * `left(col, length) <> prefix` rather than `NOT LIKE prefix || '%'`: a key id
 * may contain `_`, which LIKE reads as "any one character", so a LIKE would
 * call a neighbouring key id current and leave its rows behind. It also picks
 * up a PLAINTEXT token, which carries no prefix at all — a row whose only
 * token was written around the auth adapter used to match nothing and was
 * walked past, leaving rotation to report success with plaintext at rest.
 * Selected here, it reaches `reseal`, which refuses it.
 *
 * A function returning `SQL` rather than a string of `$1`/`$2` placeholders:
 * the string form left every embedding statement to bind the prefix and its
 * length itself, in that order, and a statement that bound them in another
 * order still compiled. `remaining` and `rotateBatch` now cannot disagree
 * about which rows are behind, which is what
 * `__tests__/rotate.test.ts`'s boundary case pins.
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

/** One column's contribution to the distinct key ids `account` holds. */
const accountKeyIdsOf = (
  tx: Transaction['Service']['tx'],
  column: OAuthTokenColumn,
) =>
  // Only rows that carry the sealed prefix: a plaintext token has no key id to
  // report, and the read path refuses it wherever it is used. `split_part`
  // answers `''` rather than null for a value with nothing between the two
  // colons, and that empty id is kept — a key id no keyring could hold is
  // exactly what the boot check counts.
  tx
    .selectDistinct({
      keyId: sql<string>`split_part(${account[column]}, ':', 2)`.as('keyId'),
    })
    .from(account)
    .where(like(account[column], SEALED_PREFIX_PATTERN));

/** One column's contribution to the probe: any row sealed under `prefix`. */
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
    // UNION, not UNION ALL: one id present in two columns is one id in use,
    // and the boot check counts what this returns.
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
    if (row === undefined || row.token === null) return null;
    const column = decodeProbedColumn(row.columnName);
    const token = row.token;
    return (cipher: SecretsCipherApi) =>
      cipher.openOAuthToken(
        { providerId: row.providerId, accountId: row.accountId, column },
        token,
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
    cipher: SecretsCipherApi,
    batchSize: number,
  ) {
    // A row is behind when ANY of its tokens is, and every token present is
    // then re-sealed — so a row always carries one key id across its three
    // columns, whatever order better-auth wrote them in.
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
        // A plaintext token in one of these columns is a fault, not a value to
        // encrypt on the way past: sealing it here would hide the write that
        // bypassed the auth adapter. The batch fails, nothing commits, and a
        // person looks at the row.
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
      // `updatedAt` is left alone: better-auth's own writes own that column,
      // and a session's freshness has nothing to do with which key holds it.
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

/**
 * The sealed `value` of an `apikey` protocol asset, one row per asset of one
 * protocol. Unlike the other two stores its identity is the whole primary key
 * — a key is bound to the team, the protocol AND the asset — so every
 * statement here carries all three.
 */
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
    if (row === undefined) return null;
    return (cipher: SecretsCipherApi) =>
      cipher.openAssetKey(
        {
          teamId: row.teamId,
          protocolId: row.protocolId,
          assetId: row.assetId,
        },
        { ciphertext: row.ciphertext, keyId },
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
    function* (cipher: SecretsCipherApi, batchSize: number) {
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
        // `updated_at`, as in the other two stores, records when a researcher
        // last changed the key — not when a deployment last re-keyed it.
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

/**
 * The three places Studio stores a secret. Adding a fourth means adding an
 * entry here and nothing else: the boot check and the rotation command both
 * walk this list.
 */
export const SECRET_STORES: readonly SecretStore[] = [
  webhookSubscriptionsStore,
  accountStore,
  protocolAssetKeysStore,
];
