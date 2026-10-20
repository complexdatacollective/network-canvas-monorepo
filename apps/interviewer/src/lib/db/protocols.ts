import { db } from './db';
import {
  assertPlaintextStillAllowed,
  decryptAsset,
  decryptProtocol,
  encryptAsset,
  encryptProtocol,
  preparingPlaintext,
} from './recordCrypto';
import type {
  ProtocolWithCounts,
  StoredAsset,
  StoredAssetType,
  StoredProtocol,
} from './types';

export async function listProtocols(): Promise<ProtocolWithCounts[]> {
  const rows = await db.protocols
    .orderBy('importedAt')
    // Dexie Collection.reverse() returns a descending Collection, not an Array.
    // oxlint-disable-next-line unicorn/no-array-reverse
    .reverse()
    .toArray();
  const sessions = await db.sessions.toArray();
  const counts = new Map<string, number>();
  for (const s of sessions) {
    counts.set(s.protocolHash, (counts.get(s.protocolHash) ?? 0) + 1);
  }
  const decrypted = await Promise.all(rows.map((row) => decryptProtocol(row)));
  return decrypted.map((p) => ({
    ...p,
    sessionCount: counts.get(p.hash) ?? 0,
  }));
}

export async function getProtocolByHash(
  hash: string,
): Promise<StoredProtocol | undefined> {
  const row = await db.protocols.where('hash').equals(hash).first();
  return row ? decryptProtocol(row) : undefined;
}

export async function getProtocolsByHashes(
  hashes: readonly string[],
): Promise<StoredProtocol[]> {
  const out: StoredProtocol[] = [];
  for (const hash of new Set(hashes)) {
    const row = await db.protocols.where('hash').equals(hash).first();
    if (row) out.push(await decryptProtocol(row));
  }
  return out;
}

const STORED_ASSET_TYPES: readonly string[] = [
  'image',
  'video',
  'audio',
  'network',
  'geojson',
  'apikey',
] satisfies StoredAssetType[];

const isStoredAssetType = (value: unknown): value is StoredAssetType =>
  typeof value === 'string' && STORED_ASSET_TYPES.includes(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// A schema 8 document is validated on this branch only for its shape (see
// `importProtocol`), so its name and manifest are read as what they may be.

/** The name a protocol is stored under, which every row must have. */
function protocolName(protocol: StoredProtocol['protocol']): string {
  const { name } = protocol;
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('A protocol must have a name to be stored');
  }
  return name;
}

/** The type the asset manifest gives `assetId`, as Interviewer 8 reads it. */
function manifestAssetType(
  protocol: StoredProtocol['protocol'],
  assetId: string,
): StoredAssetType | undefined {
  const manifest: unknown = protocol.assetManifest;
  if (!isRecord(manifest)) return undefined;
  const entry = manifest[assetId];
  if (!isRecord(entry)) return undefined;
  return isStoredAssetType(entry.type) ? entry.type : undefined;
}

/**
 * Store a validated protocol and its assets, replacing any with the same
 * hash. Every schema gets the same row, which is exactly the row Interviewer
 * 8's `saveProtocol` writes: a schema 8 protocol saved here is read and run by
 * Interviewer 8 at `/v8/` as if it had imported it itself.
 */
export async function saveProtocol(
  protocol: StoredProtocol['protocol'],
  hash: string,
  assets: { id: string; name: string; data: Blob | string }[],
): Promise<StoredProtocol> {
  const existing = await getProtocolByHash(hash);
  const id = existing?.id ?? hash;
  // Refresh on every save, including a same-hash re-import. The protocol hash
  // excludes `assetManifest`, so re-importing with updated asset bytes keeps the
  // same hash; a fresh timestamp is what tells the asset resolver its cached
  // blob URL has been superseded (see assetResolver.ts), so the stale one is
  // revoked. Advance it monotonically so two same-hash saves in the same
  // millisecond still produce a strictly newer timestamp — the resolver
  // compares these to decide which of two URLs for one asset is the live one.
  const nowIso = new Date().toISOString();
  const importedAt =
    existing && nowIso <= existing.importedAt
      ? new Date(Date.parse(existing.importedAt) + 1).toISOString()
      : nowIso;
  const fields = {
    id,
    hash,
    name: protocolName(protocol),
    lastModified: protocol.lastModified,
    importedAt,
    description: protocol.description,
  };
  // Spelt out per schema only so the row's document type follows its
  // `schemaVersion`; the two rows have the same fields.
  const stored: StoredProtocol =
    protocol.schemaVersion === 8
      ? {
          ...fields,
          schemaVersion: protocol.schemaVersion,
          codebook: protocol.codebook,
          protocol,
        }
      : {
          ...fields,
          schemaVersion: protocol.schemaVersion,
          codebook: protocol.codebook,
          protocol,
        };

  const assetRecords: StoredAsset[] = assets.map((asset) => {
    const type = manifestAssetType(protocol, asset.id) ?? 'image';
    return {
      id: `${hash}::${asset.id}`,
      protocolHash: hash,
      assetId: asset.id,
      name: asset.name,
      type,
      data: asset.data,
    };
  });

  // Encrypt BEFORE opening the transaction (transaction-liveness rule): the
  // crypto.subtle awaits would let Dexie auto-commit an open tx mid-await.
  const plaintext = preparingPlaintext();
  const protocolRow = await encryptProtocol(stored);
  const assetRows = await Promise.all(
    assetRecords.map((record) => encryptAsset(record)),
  );

  await db.transaction(
    'rw',
    [db.protocols, db.assets, db.settings],
    async () => {
      await assertPlaintextStillAllowed(plaintext);
      await db.protocols.put(protocolRow);
      await db.assets.where('protocolHash').equals(hash).delete();
      if (assetRows.length > 0) {
        await db.assets.bulkPut(assetRows);
      }
    },
  );

  return stored;
}

/** Delete a protocol of any schema, with its interviews and assets. */
export async function deleteProtocol(hash: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.protocols, db.sessions, db.assets],
    async () => {
      await db.assets.where('protocolHash').equals(hash).delete();
      await db.sessions.where('protocolHash').equals(hash).delete();
      await db.protocols.where('hash').equals(hash).delete();
    },
  );
}

export async function getProtocolAssets(hash: string): Promise<StoredAsset[]> {
  const rows = await db.assets.where('protocolHash').equals(hash).toArray();
  return Promise.all(rows.map((row) => decryptAsset(row)));
}

export async function getProtocolAsset(
  hash: string,
  assetId: string,
): Promise<StoredAsset | undefined> {
  const row = await db.assets.get(`${hash}::${assetId}`);
  return row ? decryptAsset(row) : undefined;
}

export async function listProtocolIds(): Promise<string[]> {
  return db.protocols.orderBy('id').primaryKeys();
}

export async function listAssetIds(): Promise<string[]> {
  return db.assets.orderBy('id').primaryKeys();
}

// Re-encrypt a single protocol row under the currently-held DEK, preserving
// every field value exactly (decrypt → encrypt round-trip; no timestamp is
// stamped). A plaintext row written while unconfigured gains `_enc`; a row
// already encrypted under this DEK round-trips unchanged. Unlike sessions,
// protocol/asset rows are only written by user-initiated import, so no per-id
// serializer is needed.
export async function reencryptProtocol(id: string): Promise<void> {
  const existingRow = await db.protocols.get(id);
  if (!existingRow) return;
  const existing = await decryptProtocol(existingRow);
  const row = await encryptProtocol(existing);
  await db.protocols.put(row);
}

export async function reencryptAsset(id: string): Promise<void> {
  const existingRow = await db.assets.get(id);
  if (!existingRow) return;
  const existing = await decryptAsset(existingRow);
  const row = await encryptAsset(existing);
  await db.assets.put(row);
}
