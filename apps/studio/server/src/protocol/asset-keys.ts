// Where an `apikey` protocol asset's value lives, and the only code that takes
// one out of a section document or puts one back (#1900).
//
// The `assets` section is content-addressed like every other section: its
// document is hashed into `sections`, named by every manifest revision the
// draft goes through, and pinned by every version published from it. A key
// written there would therefore be at rest in as many rows as the protocol has
// revisions, and would travel into every read that returns a section document
// — `protocols.draft`, a diff, an export. So it never reaches the document:
// the server strips it at the write boundary and seals it here, and only an
// assembly for a participant session or a researcher preview opens one.
import type pg from 'pg';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { SecretsCipher } from '../secrets/cipher.ts';

/**
 * What a document carries in place of a key while it is validated.
 *
 * Schema 8 requires an `apikey` asset's `value` to be a non-empty string, so a
 * stored — and therefore redacted — document does not validate as it stands.
 * What validation is checking is the protocol's shape, not the key's content,
 * so it runs against a copy carrying this instead, and publishing a protocol
 * decrypts nothing.
 */
export const ASSET_KEY_PLACEHOLDER = 'studio-asset-key';

/** Keyed by the asset's manifest id, which is its id in `protocol_asset_keys`. */
export type AssetKeyValues = Map<string, string>;

/** The protocol line a set of asset keys belongs to. */
export type ProtocolAssetScope = { teamId: string; protocolId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether one manifest entry is an API key carrying its value.
 *
 * `'value' in entry` rather than a type check on it: an entry carrying
 * `value: null` is still an entry whose key belongs in `protocol_asset_keys`,
 * and admitting it because the value is not a string would let the shape this
 * module exists to prevent through.
 */
function holdsKeyValue(entry: unknown): entry is Record<string, unknown> {
  return isRecord(entry) && entry.type === 'apikey' && 'value' in entry;
}

/**
 * The document as it is stored, and the keys taken out of it.
 *
 * Pure, and the one place the stored shape is decided, so the write boundary,
 * the sync refusal and the database trigger are all describing the same thing.
 * Entries that are not API keys are passed through untouched — including an
 * `apikey` entry that carries no value, which is what a second write of an
 * unchanged manifest looks like.
 */
export function stripAssetKeyValues(assetsDoc: SectionDoc): {
  doc: SectionDoc;
  values: AssetKeyValues;
} {
  const values: AssetKeyValues = new Map();
  let doc: SectionDoc | undefined;
  for (const [assetId, entry] of Object.entries(assetsDoc)) {
    if (!holdsKeyValue(entry)) continue;
    // Copied lazily: a manifest with no keys in it is returned as it came in,
    // so a write that changes nothing still hashes to what it hashed before.
    doc ??= { ...assetsDoc };
    const { value, ...rest } = entry;
    doc[assetId] = rest;
    if (typeof value === 'string' && value.length > 0) {
      values.set(assetId, value);
    }
  }
  return { doc: doc ?? assetsDoc, values };
}

/**
 * Whether an `assets` document is in the stored shape. What the sync validator
 * asks, so a client commit carrying a key is refused rather than quietly
 * stripped: clients stage a key through `resources.stage`, and a commit that
 * carries one is a client doing something the contract has no route for.
 */
export function assetsSectionHoldsNoKeys(doc: SectionDoc): boolean {
  return !Object.values(doc).some(holdsKeyValue);
}

/**
 * An assembled protocol document with every API key's value filled in with the
 * placeholder, for validation. Shallow copies only what it rewrites, and
 * returns the document unchanged when it has no key assets.
 */
export function withPlaceholderAssetKeys(
  document: Record<string, unknown>,
): Record<string, unknown> {
  const manifest = document.assetManifest;
  if (!isRecord(manifest)) return document;
  let filled: Record<string, unknown> | undefined;
  for (const [assetId, entry] of Object.entries(manifest)) {
    if (!isRecord(entry) || entry.type !== 'apikey') continue;
    if (typeof entry.value === 'string' && entry.value.length > 0) continue;
    filled ??= { ...manifest };
    filled[assetId] = { ...entry, value: ASSET_KEY_PLACEHOLDER };
  }
  if (filled === undefined) return document;
  return { ...document, assetManifest: filled };
}

/**
 * Seals each value under the row it belongs to and upserts it.
 *
 * Upsert rather than insert because a researcher may replace a key under the
 * same asset id, and the row is keyed by the asset rather than by the revision
 * that wrote it. Rows are never deleted when an asset leaves a manifest: a
 * published version still pins the revision that named it, and that version
 * has to go on assembling for a participant.
 */
export async function sealAssetKeys(
  client: pg.PoolClient,
  cipher: SecretsCipher,
  scope: ProtocolAssetScope,
  values: AssetKeyValues,
): Promise<void> {
  for (const [assetId, value] of values) {
    const sealed = cipher.sealAssetKey({ ...scope, assetId }, value);
    await client.query(
      `INSERT INTO protocol_asset_keys
         (team_id, protocol_id, asset_id, ciphertext, key_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (team_id, protocol_id, asset_id) DO UPDATE
         SET ciphertext = EXCLUDED.ciphertext,
             key_id = EXCLUDED.key_id,
             updated_at = now()`,
      [
        scope.teamId,
        scope.protocolId,
        assetId,
        sealed.ciphertext,
        sealed.keyId,
      ],
    );
  }
}

/**
 * Anything that runs one statement: a transaction's client, or a `TenantDb`,
 * whose own query is a team-stamped transaction of one. Structural so a read
 * can be made either way without the caller opening a transaction it does not
 * otherwise need.
 */
type QueryRunner = {
  query(text: string, values?: unknown[]): Promise<pg.QueryResult>;
};

/**
 * The plaintext key for one asset, or undefined when the protocol has no row
 * for it. A row that exists but cannot be opened throws
 * `SecretUnreadableError` from the cipher rather than reading as absent: a key
 * sealed under a retired keyring entry, or moved to another protocol, is a
 * fault an operator has to see, not an asset that quietly lost its value.
 */
export async function openAssetKey(
  client: QueryRunner,
  cipher: SecretsCipher,
  identity: ProtocolAssetScope & { assetId: string },
): Promise<string | undefined> {
  const result = await client.query(
    `SELECT ciphertext, key_id FROM protocol_asset_keys
     WHERE team_id = $1 AND protocol_id = $2 AND asset_id = $3`,
    [identity.teamId, identity.protocolId, identity.assetId],
  );
  const row = result.rows[0] as
    | { ciphertext: Buffer; key_id: string }
    | undefined;
  if (row === undefined) return undefined;
  return cipher.openAssetKey(identity, {
    ciphertext: row.ciphertext,
    keyId: row.key_id,
  });
}
