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
import { and, eq, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';
import type { SecretsCipherApi } from '../secrets/cipher.ts';
import { PROTOCOL_TABLES } from './schema.ts';

const protocolAssetKeys = PROTOCOL_TABLES.protocolAssetKeys;

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
 * A bare `assets` section document with every redacted API key's value filled
 * in with the placeholder, for validation. Shallow copies only what it
 * rewrites, and returns the document unchanged when it has no redacted key
 * assets — so a document that never held one still hashes to what it did.
 *
 * Every Studio path that validates a STORED assets section goes through here,
 * because the shared `AssetsSectionSchema` is Architect's too and cannot be
 * relaxed: it requires an `apikey` entry's `value`, and a stored entry has
 * none. Without the fill, a researcher adding a geojson beside a promoted key
 * was refused at [<assetId>, value] with an issue no client could satisfy.
 * The filled copy is never written anywhere.
 */
export function withPlaceholderAssetKeyEntries(
  assetsDoc: SectionDoc,
): SectionDoc {
  let filled: SectionDoc | undefined;
  for (const [assetId, entry] of Object.entries(assetsDoc)) {
    if (!isRecord(entry) || entry.type !== 'apikey') continue;
    if (typeof entry.value === 'string' && entry.value.length > 0) continue;
    filled ??= { ...assetsDoc };
    filled[assetId] = { ...entry, value: ASSET_KEY_PLACEHOLDER };
  }
  return filled ?? assetsDoc;
}

/**
 * The same fill against an assembled protocol document, whose manifest is the
 * `assets` section under another name. Returns the document unchanged when it
 * has no key assets.
 */
export function withPlaceholderAssetKeys(
  document: Record<string, unknown>,
): Record<string, unknown> {
  const manifest = document.assetManifest;
  if (!isRecord(manifest)) return document;
  const filled = withPlaceholderAssetKeyEntries(manifest as SectionDoc);
  if (filled === manifest) return document;
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
 *
 * One statement per key rather than one multi-row upsert: `ON CONFLICT DO
 * UPDATE` refuses a command that would touch the same row twice (21000), and
 * the loop opens no scope of its own — a nested scope per row would be a
 * savepoint per row on the caller's connection.
 */
export const sealAssetKeys: (
  cipher: SecretsCipherApi,
  scope: ProtocolAssetScope,
  values: AssetKeyValues,
  createdAt?: Date,
) => Effect.Effect<void, SqlError.SqlError, Transaction> = Effect.fn(
  'protocol.store.sealAssetKeys',
)(function* (
  cipher: SecretsCipherApi,
  scope: ProtocolAssetScope,
  values: AssetKeyValues,
  /**
   * Dates the rows for a caller that knows when the protocol was made — the
   * synthetic-data seed, as for `insertDraftRows`. A live write leaves it
   * unset and takes the clock.
   */
  createdAt?: Date,
) {
  const { tx } = yield* Transaction;
  // The database's clock where the caller named no date, which is what
  // `COALESCE($6, now())` said — not this process's.
  const written = createdAt ?? sql`now()`;
  for (const [assetId, value] of values) {
    const sealed = cipher.sealAssetKey({ ...scope, assetId }, value);
    // `.returning()` is not decoration: a write without it answers with the
    // driver's own result object, which is typed as a row array and is not
    // one — so the check below would read `undefined` and invert.
    const rows = yield* tx
      .insert(protocolAssetKeys)
      .values({
        teamId: scope.teamId,
        protocolId: scope.protocolId,
        assetId,
        ciphertext: sealed.ciphertext,
        keyId: sealed.keyId,
        createdAt: written,
        updatedAt: written,
      })
      .onConflictDoUpdate({
        target: [
          protocolAssetKeys.teamId,
          protocolAssetKeys.protocolId,
          protocolAssetKeys.assetId,
        ],
        set: {
          ciphertext: sealed.ciphertext,
          keyId: sealed.keyId,
          updatedAt: written,
        },
      })
      .returning({ assetId: protocolAssetKeys.assetId });
    if (rows.length === 0) {
      return yield* Effect.die(
        new Error(`sealing asset key ${assetId} wrote no row`),
      );
    }
  }
}, sqlErrorsOnly);

/**
 * The plaintext key for one asset, or undefined when the protocol has no row
 * for it. A row that exists but cannot be opened throws
 * `SecretUnreadableError` from the cipher rather than reading as absent: a key
 * sealed under a retired keyring entry, or moved to another protocol, is a
 * fault an operator has to see, not an asset that quietly lost its value.
 */
export const openAssetKey: (
  cipher: SecretsCipherApi,
  identity: ProtocolAssetScope & { assetId: string },
) => Effect.Effect<string | undefined, SqlError.SqlError, Transaction> =
  Effect.fn('protocol.store.openAssetKey')(function* (
    cipher: SecretsCipherApi,
    identity: ProtocolAssetScope & { assetId: string },
  ) {
    const { tx } = yield* Transaction;
    const rows = yield* tx
      .select({
        ciphertext: protocolAssetKeys.ciphertext,
        keyId: protocolAssetKeys.keyId,
      })
      .from(protocolAssetKeys)
      .where(
        and(
          eq(protocolAssetKeys.teamId, identity.teamId),
          eq(protocolAssetKeys.protocolId, identity.protocolId),
          eq(protocolAssetKeys.assetId, identity.assetId),
        ),
      );
    const row = rows[0];
    if (row === undefined) return undefined;
    // A `bytea` decodes as a `Buffer` through node-postgres and as a plain
    // `Uint8Array` through `@effect/sql-pg`; drizzle declares the column as
    // the former and hands back whatever the driver produced. The cipher
    // takes the wider of the two (`StoredSecret`), so the row opens either
    // way — and `__tests__/asset-keys.test.ts` asserts which one arrives.
    return cipher.openAssetKey(identity, {
      ciphertext: row.ciphertext,
      keyId: row.keyId,
    });
  }, sqlErrorsOnly);
