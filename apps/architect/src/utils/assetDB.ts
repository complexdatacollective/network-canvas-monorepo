import Dexie, { type EntityTable } from 'dexie';

import type { CurrentProtocol } from '@codaco/protocol-validation';

// A protocol saved in the local library. The library is the durable, multi-
// protocol store surfaced on the home screen; the redux `activeProtocol` slice
// is the in-session editing buffer that mirrors into its library row.
export type StoredProtocolRow = {
  id: string;
  name: string;
  description?: string;
  schemaVersion: number;
  protocol: CurrentProtocol;
  createdAt: number;
  updatedAt: number;
};

// An asset row, namespaced to its owning protocol. `id` is the compound primary
// key `${protocolId}::${assetId}` so the same manifest asset id can exist under
// multiple protocols (e.g. the sample template opened twice) without colliding.
// `assetId` is the original (bare) manifest id callers refer to.
export type StoredAsset = {
  id: string;
  assetId: string;
  protocolId: string;
  name: string;
  data: Blob | string;
};

export const assetKey = (protocolId: string, assetId: string): string =>
  `${protocolId}::${assetId}`;

export const assetDb = new Dexie('ArchitectProtocolDB') as Dexie & {
  assets: EntityTable<StoredAsset, 'id'>;
  protocols: EntityTable<StoredProtocolRow, 'id'>;
};

assetDb.version(1).stores({
  assets: 'id, protocolId',
  protocols: 'id, updatedAt',
});

export async function clearAllStorage() {
  try {
    localStorage.clear();
    await Promise.all([assetDb.assets.clear(), assetDb.protocols.clear()]);
    window.location.reload();
  } catch (_error) {}
}
