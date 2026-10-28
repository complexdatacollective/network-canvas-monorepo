import { Dexie, type EntityTable } from 'dexie';

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

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Dexie's documented TypeScript pattern: the tables are added at runtime by version().stores(), so the instance is typed with them
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

/**
 * Remove every protocol this app stores, then reload.
 *
 * Only this app's own library. Architect 8's library on the same origin is not
 * this app's to delete — its protocols stay listed, and Architect 8's own
 * Clear all removes them. localStorage is left alone for the same reason: every
 * key in it (language, analytics, dismissed notices) is shared with Architect 8.
 *
 * Throws when the library cannot be cleared, so the caller can say so.
 */
export async function clearAllStorage(): Promise<void> {
  await assetDb.transaction(
    'rw',
    [assetDb.assets, assetDb.protocols, assetDb.legacyProtocolChoices],
    async () => {
      await Promise.all([
        assetDb.assets.clear(),
        assetDb.protocols.clear(),
        assetDb.legacyProtocolChoices.clear(),
      ]);
    },
  );
  window.location.reload();
}
