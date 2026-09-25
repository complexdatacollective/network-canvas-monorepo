import { Effect, Option } from 'effect';

import type { ObjectStore, StoredAsset } from './storage/object-store.ts';

// The object store as the protocol builder's oRPC router takes it: promises,
// because that router is one until stage 8 moves it onto the rpc plane
// (#1930). The store itself is the `ObjectStore` service
// (src/storage/object-store.ts) and `/storage` is an Effect route
// (src/http/storage.ts); this is the one promise-shaped view of it, built
// from the same service value so a promotion and an upload name the same
// bytes.

// Walking-skeleton bound; revisit with real stimuli sizes and the presigned
// direct-upload question on #1278. Exported because it is what Studio will
// store for one file however the bytes arrive: the protocol-builder host
// stages through the RPC surface rather than the `/storage` route, and a
// second bound there would be a second answer to the same question.
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export type AssetStore = {
  put(bytes: Uint8Array, mediaType: string): Promise<StoredAsset>;
  get(hash: string): Promise<{
    body: ReadableStream;
    mediaType: string;
    size: number | undefined;
  } | null>;
  /**
   * Does the configured bucket answer? Resolving means reachable. `signal`
   * ends the request as well as the wait, as `ObjectStore.head` does for its
   * own caller.
   */
  head(signal?: AbortSignal): Promise<void>;
};

/** The promise view of a configured store; absent where it is not. */
export function assetStoreOf(
  store: ObjectStore['Service'],
): AssetStore | undefined {
  if (!store.configured) return undefined;
  return {
    put: (bytes, mediaType) => Effect.runPromise(store.put(bytes, mediaType)),
    get: (hash) =>
      Effect.runPromise(Effect.map(store.get(hash), Option.getOrNull)),
    head: (signal) =>
      Effect.runPromise(store.head, signal === undefined ? {} : { signal }),
  };
}
