import Dexie, { type EntityTable } from 'dexie';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { ProtocolSourceRef } from '~/templates';

import { PROTOCOL_DB_NAME } from './storageNames';

// A protocol saved in the local library. The library is the durable, multi-
// protocol store surfaced on the home screen; the redux `activeProtocol` slice
// is the in-session editing buffer that mirrors into its library row.
export type StoredProtocolRow = {
  id: string;
  name: string;
  description?: string;
  schemaVersion: number;
  protocol: CurrentProtocol;
  // Present only after this exact canonical body has passed validation. Rows
  // written by older Architect versions are intentionally unmarked and receive
  // a one-time admission check before opening.
  validated?: true;
  sourceRef?: ProtocolSourceRef;
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

/**
 * What the researcher decided about one protocol in an earlier Architect's
 * library, keyed by that protocol's id there.
 *
 * `legacy` means it stays with the Architect that wrote it, so opening it goes
 * straight there. `upgraded` means a copy was made in this library, under
 * `upgradedId`. The earlier library itself is never written, so the decision is
 * remembered here.
 */
export type LegacyProtocolChoice = {
  legacyId: string;
  choice: 'legacy' | 'upgraded';
  upgradedId?: string;
  updatedAt: number;
};

export const assetDb = new Dexie(PROTOCOL_DB_NAME) as Dexie & {
  assets: EntityTable<StoredAsset, 'id'>;
  protocols: EntityTable<StoredProtocolRow, 'id'>;
  legacyProtocolChoices: EntityTable<LegacyProtocolChoice, 'legacyId'>;
};

// A database of its own (see `storageNames`), so it starts at version 1 with
// no upgrader: nothing older than this schema has ever been written to it.
assetDb.version(1).stores({
  assets: 'id, protocolId',
  protocols: 'id, updatedAt',
  legacyProtocolChoices: 'legacyId',
});

export async function clearAllStorage() {
  try {
    localStorage.clear();
    await Promise.all([assetDb.assets.clear(), assetDb.protocols.clear()]);
    window.location.reload();
  } catch (_error) {}
}
