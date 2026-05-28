import type { CurrentProtocol } from '@codaco/protocol-validation';

import { assetDb, type StoredProtocolRow } from './assetDB';
import { deleteProtocolAssets } from './assetUtils';

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
};

export const putStoredProtocol = async ({
  id,
  protocol,
  name,
  description,
}: UpsertProtocolInput): Promise<void> => {
  const now = Date.now();
  const existing = await assetDb.protocols.get(id);
  await assetDb.protocols.put({
    id,
    protocol,
    name,
    description,
    schemaVersion: protocol.schemaVersion,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
};

export const deleteStoredProtocol = async (id: string): Promise<void> => {
  await assetDb.protocols.delete(id);
  await deleteProtocolAssets(id);
};
