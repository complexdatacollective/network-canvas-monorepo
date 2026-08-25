import { isEqual } from 'es-toolkit/compat';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { ProtocolSourceRef } from '~/templates';

import { assetDb, type StoredProtocolRow } from './assetDB';
import { deleteOrphanedAssets, deleteProtocolAssets } from './assetUtils';

// Most-recently-updated first. Sort the materialised array (rather than the
// Dexie collection) so the lint autofixer doesn't rewrite a Dexie `.reverse()`
// into the Array-only `.toReversed()`, which the collection doesn't implement.
export const listProtocols = async (): Promise<StoredProtocolRow[]> => {
  const rows = await assetDb.protocols.orderBy('updatedAt').toArray();
  return rows.toReversed();
};

export const getStoredProtocol = async (
  id: string,
): Promise<StoredProtocolRow | undefined> => {
  return await assetDb.protocols.get(id);
};

type UpsertProtocolInput = {
  id: string;
  protocol: CurrentProtocol;
  name: string;
  description?: string;
  sourceRef?: ProtocolSourceRef;
  retainedAssetIds?: Iterable<string>;
};

export const putStoredProtocol = async ({
  id,
  protocol,
  name,
  description,
  sourceRef,
  retainedAssetIds = [],
}: UpsertProtocolInput): Promise<void> => {
  const now = Date.now();
  const existing = await assetDb.protocols.get(id);
  await assetDb.protocols.put({
    id,
    protocol,
    name,
    description,
    sourceRef: sourceRef ?? existing?.sourceRef,
    validated: true,
    schemaVersion: protocol.schemaVersion,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  // GC blobs left behind by committed manifest deletes. Callers can retain
  // blobs still reachable through Undo/Redo history; they are reclaimed by a
  // later commit after that history disappears. Best-effort: a GC failure must
  // not fail the save itself.
  //
  // A nullish manifest is not an authoritative empty keep-set — treating it as
  // one would orphan (and delete) every stored asset for the protocol, so skip
  // the GC entirely until a real manifest is present.
  if (protocol.assetManifest) {
    try {
      await deleteOrphanedAssets(id, [
        ...Object.keys(protocol.assetManifest),
        ...retainedAssetIds,
      ]);
    } catch (error) {
      console.error('Failed to remove orphaned assets during save', error);
    }
  }
};

export const markStoredProtocolValidated = async (
  expected: StoredProtocolRow,
): Promise<void> => {
  // Validation happens outside this transaction because it may be
  // asynchronous. The short read/write transaction binds the provenance mark
  // to the exact revision that passed validation and prevents another tab from
  // replacing the body between the comparison and update.
  await assetDb.transaction('rw', assetDb.protocols, async () => {
    const current = await assetDb.protocols.get(expected.id);
    if (!current) {
      throw new Error(`Protocol ${expected.id} disappeared during validation.`);
    }

    if (
      current.updatedAt !== expected.updatedAt ||
      current.schemaVersion !== expected.schemaVersion ||
      !isEqual(current.protocol, expected.protocol)
    ) {
      throw new Error(
        `Protocol ${expected.id} changed while it was being validated. Try opening it again.`,
      );
    }

    const updated = await assetDb.protocols.update(expected.id, {
      validated: true,
    });
    if (updated === 0) {
      throw new Error(`Protocol ${expected.id} disappeared during validation.`);
    }
  });
};

export const deleteStoredProtocol = async (id: string): Promise<void> => {
  // Delete the row and its assets atomically: if asset deletion fails the row
  // delete rolls back too, so we never strand orphaned assets under a missing
  // protocol (or vice versa).
  await assetDb.transaction(
    'rw',
    assetDb.protocols,
    assetDb.assets,
    async () => {
      await assetDb.protocols.delete(id);
      await deleteProtocolAssets(id);
    },
  );
};
