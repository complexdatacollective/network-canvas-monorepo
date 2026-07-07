import type { CurrentProtocol } from '@codaco/protocol-validation';

import { db } from './db';
import {
  decryptAsset,
  decryptProtocol,
  encryptAsset,
  encryptProtocol,
} from './recordCrypto';
import type { ProtocolWithCounts, StoredAsset, StoredProtocol } from './types';

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

export async function saveProtocol(
  protocol: CurrentProtocol,
  hash: string,
  assets: { id: string; name: string; data: Blob | string }[],
): Promise<StoredProtocol> {
  const existing = await getProtocolByHash(hash);
  const id = existing?.id ?? hash;
  // Refresh on every save, including a same-hash re-import. The protocol hash
  // excludes `assetManifest`, so re-importing with updated asset bytes keeps the
  // same hash; a fresh timestamp is what changes the asset resolver's cache key
  // (see assetResolver.ts) so stale blob URLs get evicted. Advance it
  // monotonically so two same-hash saves in the same millisecond still produce
  // a strictly newer key.
  const nowIso = new Date().toISOString();
  const importedAt =
    existing && nowIso <= existing.importedAt
      ? new Date(Date.parse(existing.importedAt) + 1).toISOString()
      : nowIso;
  const stored: StoredProtocol = {
    id,
    hash,
    name: protocol.name,
    schemaVersion: protocol.schemaVersion,
    lastModified: protocol.lastModified,
    importedAt,
    description: protocol.description,
    codebook: protocol.codebook,
    protocol,
  };

  const assetRecords: StoredAsset[] = assets.map((asset) => {
    const manifestEntry = protocol.assetManifest?.[asset.id];
    const type = manifestEntry?.type ?? 'image';
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
  const protocolRow = await encryptProtocol(stored);
  const assetRows = await Promise.all(
    assetRecords.map((record) => encryptAsset(record)),
  );

  await db.transaction('rw', db.protocols, db.assets, async () => {
    await db.protocols.put(protocolRow);
    await db.assets.where('protocolHash').equals(hash).delete();
    if (assetRows.length > 0) {
      await db.assets.bulkPut(assetRows);
    }
  });

  return stored;
}

export async function deleteProtocol(hash: string): Promise<void> {
  await db.transaction('rw', db.protocols, db.sessions, db.assets, async () => {
    await db.assets.where('protocolHash').equals(hash).delete();
    await db.sessions.where('protocolHash').equals(hash).delete();
    await db.protocols.where('hash').equals(hash).delete();
  });
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
