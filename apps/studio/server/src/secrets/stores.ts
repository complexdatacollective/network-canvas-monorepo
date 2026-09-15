import type pg from 'pg';

import {
  type OAuthTokenColumn,
  sealedOAuthTokenPrefix,
  type SecretsCipher,
} from './cipher.ts';

// Every place a secret is stored, as one entry each (#1900). The boot check
// and the rotation command both walk this list rather than naming tables
// themselves, so a new store is added in one place and is immediately both
// verified at boot and rotated — the failure a registry exists to prevent is a
// store that rotation forgets and that therefore pins an old key forever.
//
// Every statement here runs as the MAINTENANCE role: the tenant tables force
// row-level security, so any other role sees only the team its transaction
// named, and a check that saw one team's rows would pass while another team's
// key was missing.

/**
 * Opens one stored secret with the given cipher, throwing the cipher's own
 * `SecretUnreadableError` when it will not open. What `probe` hands the boot
 * check, so that each store keeps the knowledge of which identity its rows are
 * sealed under and which open function reads them.
 */
export type SecretOpener = (cipher: SecretsCipher) => string;

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
  keyIdsInUse(client: pg.PoolClient): Promise<string[]>;
  /**
   * One stored secret sealed under `keyId`, ready to open, or null when this
   * store has none. The boot check opens one per (store, key id) so that a
   * keyring naming the right ids under the WRONG material is refused before
   * the deployment serves anything.
   */
  probe(client: pg.PoolClient, keyId: string): Promise<SecretOpener | null>;
  /**
   * Re-seals up to `batchSize` rows that are not under the current key and
   * returns how many were changed; zero means this store is finished. Runs
   * inside the caller's transaction, and takes the rows it works with
   * `FOR UPDATE SKIP LOCKED` so a second runner (or a request writing the same
   * row) never waits on it.
   */
  rotateBatch(
    client: pg.PoolClient,
    cipher: SecretsCipher,
    batchSize: number,
  ): Promise<number>;
  /**
   * How many rows are still not under `currentKeyId`. The rotation's
   * postcondition: a batch returning zero means "nothing I could take", not
   * "nothing left" — `FOR UPDATE SKIP LOCKED` steps over a row another session
   * holds — so the loop ending is not proof the store is done.
   */
  remaining(client: pg.PoolClient, currentKeyId: string): Promise<number>;
};

/**
 * Adds the row to a re-sealing failure. The row's id is not a secret and is
 * the only thing that turns "a stored secret could not be read" into something
 * an operator can act on; the cipher's own message never carries more.
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

/** A NULL key id names no stored secret; anything else is one, well-formed or not. */
function storedIds(ids: readonly (string | null)[]): string[] {
  return ids.filter((id): id is string => id !== null);
}

/** The count one `SELECT count(*)` answered, as a number rather than a string. */
function countOf(result: pg.QueryResult<{ count: string }>): number {
  return Number(result.rows[0]?.count ?? 0);
}

const webhookSubscriptions: SecretStore = {
  name: 'webhook_subscriptions',

  keyIdsInUse: async (client) => {
    const rows = await client.query<{ key_id: string }>(
      'SELECT DISTINCT secret_key_id AS key_id FROM webhook_subscriptions',
    );
    return storedIds(rows.rows.map((row) => row.key_id));
  },

  probe: async (client, keyId) => {
    const rows = await client.query<{
      id: string;
      team_id: string;
      secret_ciphertext: Buffer;
    }>(
      `SELECT id, team_id, secret_ciphertext
         FROM webhook_subscriptions
        WHERE secret_key_id = $1
        LIMIT 1`,
      [keyId],
    );
    const row = rows.rows[0];
    if (row === undefined) return null;
    return (cipher) =>
      cipher.openWebhookSecret(
        { teamId: row.team_id, subscriptionId: row.id },
        { ciphertext: row.secret_ciphertext, keyId },
      );
  },

  remaining: async (client, currentKeyId) =>
    countOf(
      await client.query<{ count: string }>(
        `SELECT count(*) AS count FROM webhook_subscriptions
          WHERE secret_key_id IS NOT NULL AND secret_key_id <> $1`,
        [currentKeyId],
      ),
    ),

  rotateBatch: async (client, cipher, batchSize) => {
    const rows = await client.query<{
      id: string;
      team_id: string;
      secret_ciphertext: Buffer;
      secret_key_id: string;
    }>(
      `SELECT id, team_id, secret_ciphertext, secret_key_id
         FROM webhook_subscriptions
        WHERE secret_key_id <> $1
        LIMIT $2
          FOR UPDATE SKIP LOCKED`,
      [cipher.currentKeyId, batchSize],
    );

    for (const row of rows.rows) {
      const identity = { teamId: row.team_id, subscriptionId: row.id };
      const resealed = reseal(`webhook_subscriptions ${row.id}`, () =>
        cipher.resealWebhookSecret(identity, {
          ciphertext: row.secret_ciphertext,
          keyId: row.secret_key_id,
        }),
      );
      // `updated_at` is deliberately left alone: rotation changes how a row is
      // stored, not when the subscription was last changed by anyone.
      await client.query(
        `UPDATE webhook_subscriptions
            SET secret_ciphertext = $1, secret_key_id = $2
          WHERE id = $3`,
        [resealed.ciphertext, resealed.keyId, row.id],
      );
    }
    return rows.rows.length;
  },
};

/**
 * better-auth's `account` table, whose three token columns hold
 * `studio-secret:<keyId>:<base64url>` strings rather than a ciphertext and a
 * key id of their own (better-auth types them as `text`). `split_part(col, ':',
 * 2)` reads the same id `parseOAuthTokenKeyId` does, because a key id can
 * never contain a `:`.
 */
const OAUTH_COLUMNS: readonly OAuthTokenColumn[] = [
  'accessToken',
  'refreshToken',
  'idToken',
];

const SEALED_PREFIX_PATTERN = 'studio-secret:%';

/**
 * "This token column holds something other than a value sealed under the
 * current key", as SQL over the prefix `sealedOAuthTokenPrefix` writes.
 *
 * `left(col, length) <> prefix` rather than `NOT LIKE prefix || '%'`: a key id
 * may contain `_`, which LIKE reads as "any one character", so a LIKE would
 * call a neighbouring key id current and leave its rows behind. It also picks
 * up a PLAINTEXT token, which carries no prefix at all — a row whose only
 * token was written around the auth adapter used to match nothing and was
 * walked past, leaving rotation to report success with plaintext at rest.
 * Selected here, it reaches `reseal`, which refuses it.
 *
 * `$1` is the prefix's length and `$2` the prefix itself.
 */
const NOT_UNDER_CURRENT_KEY = OAUTH_COLUMNS.map(
  (column) => `("${column}" IS NOT NULL AND left("${column}", $1) <> $2)`,
).join(' OR ');

const account: SecretStore = {
  name: 'account',

  keyIdsInUse: async (client) => {
    // Only rows that carry the sealed prefix: a plaintext token has no key id
    // to report, and the read path refuses it wherever it is used.
    const rows = await client.query<{ key_id: string }>(
      OAUTH_COLUMNS.map(
        (column) =>
          `SELECT DISTINCT split_part("${column}", ':', 2) AS key_id
             FROM account WHERE "${column}" LIKE $1`,
      ).join('\nUNION\n'),
      [SEALED_PREFIX_PATTERN],
    );
    return storedIds(rows.rows.map((row) => row.key_id));
  },

  probe: async (client, keyId) => {
    const prefix = sealedOAuthTokenPrefix(keyId);
    const found = OAUTH_COLUMNS.map(
      (column) =>
        `SELECT "providerId", "accountId", '${column}' AS column_name, "${column}" AS token
           FROM account WHERE left("${column}", $1) = $2`,
    ).join('\nUNION ALL\n');
    const rows = await client.query<{
      providerId: string;
      accountId: string;
      column_name: OAuthTokenColumn;
      token: string;
    }>(`${found}\nLIMIT 1`, [prefix.length, prefix]);
    const row = rows.rows[0];
    if (row === undefined) return null;
    return (cipher) =>
      cipher.openOAuthToken(
        {
          providerId: row.providerId,
          accountId: row.accountId,
          column: row.column_name,
        },
        row.token,
      );
  },

  remaining: async (client, currentKeyId) => {
    const prefix = sealedOAuthTokenPrefix(currentKeyId);
    return countOf(
      await client.query<{ count: string }>(
        `SELECT count(*) AS count FROM account WHERE ${NOT_UNDER_CURRENT_KEY}`,
        [prefix.length, prefix],
      ),
    );
  },

  rotateBatch: async (client, cipher, batchSize) => {
    // A row is behind when ANY of its tokens is, and every token present is
    // then re-sealed — so a row always carries one key id across its three
    // columns, whatever order better-auth wrote them in.
    const prefix = sealedOAuthTokenPrefix(cipher.currentKeyId);
    const rows = await client.query<
      {
        id: string;
        providerId: string;
        accountId: string;
      } & Record<OAuthTokenColumn, string | null>
    >(
      `SELECT id, "providerId", "accountId", "accessToken", "refreshToken", "idToken"
         FROM account
        WHERE ${NOT_UNDER_CURRENT_KEY}
        LIMIT $3
          FOR UPDATE SKIP LOCKED`,
      [prefix.length, prefix, batchSize],
    );

    for (const row of rows.rows) {
      const resealed = OAUTH_COLUMNS.map((column) => {
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
      });
      // `updatedAt` is left alone: better-auth's own writes own that column,
      // and a session's freshness has nothing to do with which key holds it.
      await client.query(
        `UPDATE account
            SET "accessToken" = $1, "refreshToken" = $2, "idToken" = $3
          WHERE id = $4`,
        [...resealed, row.id],
      );
    }
    return rows.rows.length;
  },
};

/**
 * The sealed `value` of an `apikey` protocol asset, one row per asset of one
 * protocol. Unlike the other two stores its identity is the whole primary key
 * — a key is bound to the team, the protocol AND the asset — so every
 * statement here carries all three.
 */
const protocolAssetKeys: SecretStore = {
  name: 'protocol_asset_keys',

  keyIdsInUse: async (client) => {
    const rows = await client.query<{ key_id: string }>(
      'SELECT DISTINCT key_id FROM protocol_asset_keys',
    );
    return storedIds(rows.rows.map((row) => row.key_id));
  },

  probe: async (client, keyId) => {
    const rows = await client.query<{
      team_id: string;
      protocol_id: string;
      asset_id: string;
      ciphertext: Buffer;
    }>(
      `SELECT team_id, protocol_id, asset_id, ciphertext
         FROM protocol_asset_keys
        WHERE key_id = $1
        LIMIT 1`,
      [keyId],
    );
    const row = rows.rows[0];
    if (row === undefined) return null;
    return (cipher) =>
      cipher.openAssetKey(
        {
          teamId: row.team_id,
          protocolId: row.protocol_id,
          assetId: row.asset_id,
        },
        { ciphertext: row.ciphertext, keyId },
      );
  },

  remaining: async (client, currentKeyId) =>
    countOf(
      await client.query<{ count: string }>(
        `SELECT count(*) AS count FROM protocol_asset_keys WHERE key_id <> $1`,
        [currentKeyId],
      ),
    ),

  rotateBatch: async (client, cipher, batchSize) => {
    const rows = await client.query<{
      team_id: string;
      protocol_id: string;
      asset_id: string;
      ciphertext: Buffer;
      key_id: string;
    }>(
      `SELECT team_id, protocol_id, asset_id, ciphertext, key_id
         FROM protocol_asset_keys
        WHERE key_id <> $1
        LIMIT $2
          FOR UPDATE SKIP LOCKED`,
      [cipher.currentKeyId, batchSize],
    );

    for (const row of rows.rows) {
      const identity = {
        teamId: row.team_id,
        protocolId: row.protocol_id,
        assetId: row.asset_id,
      };
      const resealed = reseal(
        `protocol_asset_keys ${row.protocol_id} ${row.asset_id}`,
        () =>
          cipher.resealAssetKey(identity, {
            ciphertext: row.ciphertext,
            keyId: row.key_id,
          }),
      );
      // `updated_at`, as in the other two stores, records when a researcher
      // last changed the key — not when a deployment last re-keyed it.
      await client.query(
        `UPDATE protocol_asset_keys
            SET ciphertext = $1, key_id = $2
          WHERE team_id = $3 AND protocol_id = $4 AND asset_id = $5`,
        [
          resealed.ciphertext,
          resealed.keyId,
          row.team_id,
          row.protocol_id,
          row.asset_id,
        ],
      );
    }
    return rows.rows.length;
  },
};

/**
 * The three places Studio stores a secret. Adding a fourth means adding an
 * entry here and nothing else: the boot check and the rotation command both
 * walk this list.
 */
export const SECRET_STORES: readonly SecretStore[] = [
  webhookSubscriptions,
  account,
  protocolAssetKeys,
];
