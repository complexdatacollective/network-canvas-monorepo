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

/**
 * Writes a protocol only if the stored row is still the one the caller read.
 *
 * `putStoredProtocol` replaces the whole row and compares nothing, which is
 * right for the tab that owns the protocol — its own buffer is the newest
 * thing there is. It is wrong for a write derived from a snapshot taken before
 * some slow, asynchronous work: another tab holding this protocol autosaves
 * into the same row, so a blind write lands the stale snapshot on top of
 * whatever that tab has saved since, and the researcher loses those edits with
 * nothing on screen to say so.
 *
 * Reports `false` rather than throwing when the row has moved on, because
 * "someone else got there first" is an outcome the caller has to explain, not
 * a fault. Deliberately not last-write-wins and deliberately not a merge:
 * neither can be done honestly here.
 *
 * Same shape as `markStoredProtocolValidated`'s guard, for the same reason —
 * the comparison and the write have to be one transaction, or a peer save can
 * land between them.
 */
export const putStoredProtocolIfUnchanged = async (
  expected: StoredProtocolRow,
  input: UpsertProtocolInput,
): Promise<boolean> =>
  // `assets` joins the transaction because `putStoredProtocol` garbage-collects
  // orphaned blobs as part of the durable commit.
  assetDb.transaction('rw', assetDb.protocols, assetDb.assets, async () => {
    const current = await assetDb.protocols.get(expected.id);
    if (!current) return false;
    if (
      current.updatedAt !== expected.updatedAt ||
      current.schemaVersion !== expected.schemaVersion ||
      !isEqual(current.protocol, expected.protocol)
    ) {
      return false;
    }

    await putStoredProtocol(input);
    return true;
  });

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
