import { isEqual } from 'es-toolkit/compat';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { ProtocolSourceRef } from '~/templates';

import {
  assetDb,
  assetKey,
  type LegacyProtocolChoice,
  type StoredProtocolRow,
} from './assetDB';
import { deleteOrphanedAssets, deleteProtocolAssets } from './assetUtils';
import type { LegacyProtocolSnapshot } from './legacyProtocolLibrary';
import { reportError } from './reportError';

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
      reportError(error, { operation: 'protocolLibraryOrphanedAssetGc' });
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

/** What the researcher last decided about an Architect 8 protocol, if anything. */
export const getLegacyProtocolChoice = async (
  legacyId: string,
): Promise<LegacyProtocolChoice | undefined> =>
  await assetDb.legacyProtocolChoices.get(legacyId);

/**
 * Remember that the researcher keeps an Architect 8 protocol in Architect 8,
 * so opening it from the library goes straight there next time. A copy
 * upgraded earlier stays recorded: the library still marks the row upgraded.
 */
export const recordLegacyProtocolKept = async (
  legacyId: string,
  now: number = Date.now(),
): Promise<void> => {
  await assetDb.transaction('rw', assetDb.legacyProtocolChoices, async () => {
    const existing = await assetDb.legacyProtocolChoices.get(legacyId);
    await assetDb.legacyProtocolChoices.put({
      legacyId,
      choice: 'legacy',
      upgradedId: existing?.upgradedId,
      updatedAt: now,
    });
  });
};

/** Every remembered decision about an Architect 8 protocol. */
export const listLegacyProtocolChoices = async (): Promise<
  LegacyProtocolChoice[]
> => await assetDb.legacyProtocolChoices.toArray();

type UpgradedLegacyCopy = {
  /** The library row the researcher should now be editing. */
  protocolId: string;
  /**
   * False when another tab finished upgrading the same Architect 8 protocol
   * while this one was migrating it, so its copy was kept and nothing was
   * written here.
   */
  created: boolean;
};

/**
 * Save an upgraded Architect 8 protocol as a NEW protocol in this library.
 *
 * One read-write transaction writes the row under a new id, every asset of the
 * snapshot re-keyed to that id, and the choice `upgraded` pointing at it, so
 * the library can never hold the copy without its resources or without the
 * record that it exists. Architect 8's own library is not touched.
 *
 * The caller migrated and validated `protocol` outside any transaction (both
 * are asynchronous), reading the choice first; `upgradedIdBefore` is the copy
 * that choice named then. If the choice names a different copy now, another tab
 * upgraded this protocol in the meantime, and that copy is kept rather than a
 * duplicate made. A choice that already named a copy before this upgrade began
 * does not stop it: the researcher asked for a fresh copy of what Architect 8
 * holds now.
 */
export const writeUpgradedLegacyCopy = async ({
  snapshot,
  protocol,
  upgradedIdBefore,
  createId = () => crypto.randomUUID(),
  now = Date.now(),
}: {
  snapshot: LegacyProtocolSnapshot;
  protocol: CurrentProtocol;
  upgradedIdBefore: string | undefined;
  createId?: () => string;
  now?: number;
}): Promise<UpgradedLegacyCopy> =>
  await assetDb.transaction(
    'rw',
    [assetDb.protocols, assetDb.assets, assetDb.legacyProtocolChoices],
    async () => {
      const { row, assets } = snapshot;
      const choice = await assetDb.legacyProtocolChoices.get(row.id);
      if (
        choice?.choice === 'upgraded' &&
        choice.upgradedId !== undefined &&
        choice.upgradedId !== upgradedIdBefore &&
        (await assetDb.protocols.get(choice.upgradedId))
      ) {
        return { protocolId: choice.upgradedId, created: false };
      }

      const protocolId = createId();
      await assetDb.protocols.add({
        id: protocolId,
        // The row mirrors the document, as every autosave keeps it.
        name: protocol.name,
        description: protocol.description,
        schemaVersion: protocol.schemaVersion,
        protocol,
        validated: true,
        sourceRef: row.sourceRef,
        createdAt: now,
        updatedAt: now,
      });
      await assetDb.assets.bulkAdd(
        assets.map((asset) => ({
          id: assetKey(protocolId, asset.assetId),
          assetId: asset.assetId,
          protocolId,
          name: asset.name,
          data: asset.data,
        })),
      );
      await assetDb.legacyProtocolChoices.put({
        legacyId: row.id,
        choice: 'upgraded',
        upgradedId: protocolId,
        updatedAt: now,
      });
      return { protocolId, created: true };
    },
  );
