// The id of the protocol currently loaded into the editing buffer.
//
// Assets are namespaced per protocol in IndexedDB (see `assetDB.ts`), but the
// many components and utilities that read assets only ever operate on the
// active protocol and don't know its id. Rather than thread a `protocolId`
// through every call site, the asset utils default to this value. It is a
// leaf module (no imports) to avoid import cycles, and is kept in sync with
// `app.activeProtocolId` in the redux store via a subscription in `store.ts`.
let activeProtocolId: string | null = null;

export const setActiveProtocolScope = (id: string | null): void => {
  activeProtocolId = id;
};

export const getActiveProtocolScope = (): string | null => activeProtocolId;
