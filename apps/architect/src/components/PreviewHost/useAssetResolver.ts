import { useCallback, useEffect, useRef } from 'react';

import type { AssetRequestHandler } from '@codaco/interview';
import { assetKey } from '~/utils/assetDB';
import { getAssetById } from '~/utils/assetUtils';

export function useAssetResolver(
  protocolId: string | null,
): AssetRequestHandler {
  // `urls` is the authoritative cache: an entry exists only for a URL this hook
  // minted and still owns, and teardown revokes exactly its contents. `inflight`
  // is a de-duplication index only — it never answers a request that `urls` can
  // answer, and it holds a key only while that key's read is unresolved. Without
  // it, two callers requesting the same asset before either read returns both
  // miss the cache and both mint, and the second write orphans the first URL:
  // nothing holds it, so nothing ever revokes it.
  const urls = useRef<Map<string, string>>(new Map());
  const inflight = useRef<Map<string, Promise<string>>>(new Map());
  const tornDown = useRef(false);

  useEffect(() => {
    // Cleanup marks this resolver torn down; re-running the effect (a genuine
    // remount of the same tree, which StrictMode also simulates) makes it
    // usable again rather than leaving it wedged shut. Resetting here and not
    // in the cleanup is deliberate: after a real unmount the handler can still
    // be held by detached code, and it must refuse those calls rather than mint
    // a URL with no owner. The preview entry mounts this once, without
    // StrictMode, so in shipped code the cleanup is terminal.
    tornDown.current = false;
    const owned = urls.current;
    const pending = inflight.current;
    return () => {
      tornDown.current = true;
      for (const url of owned.values()) {
        URL.revokeObjectURL(url);
      }
      owned.clear();
      // These promises can only resolve to URLs we have just revoked (or to a
      // rejection), so no later caller may be served from them.
      pending.clear();
    };
  }, []);

  return useCallback(
    async (assetId: string) => {
      if (!protocolId) {
        throw new Error(`Missing protocol scope for asset ${assetId}`);
      }

      const key = assetKey(protocolId, assetId);
      const cached = urls.current.get(key);
      if (cached) return cached;

      const pending = inflight.current.get(key);
      if (pending) return pending;

      const request = (async () => {
        // Mirror the editor's resolver: IndexedDB first, then the in-memory
        // store used when durable storage is unavailable (e.g. Safari private
        // browsing).
        const entry = await getAssetById(assetId, protocolId);
        if (!entry || typeof entry.data === 'string') {
          throw new Error(`Asset ${assetId} not found in local store`);
        }

        // The host tore down while this read was in flight. Everything from
        // here to the cache write is synchronous, so checking now is enough:
        // no one would render or revoke a URL minted after teardown, so don't
        // mint one. Callers already treat a rejection as "asset unavailable".
        if (tornDown.current) {
          throw new Error(
            `Preview closed before asset ${assetId} finished loading`,
          );
        }

        const blob =
          entry.data instanceof Blob ? entry.data : new Blob([entry.data]);
        const url = URL.createObjectURL(blob);
        urls.current.set(key, url);
        return url;
      })();

      // Once the read settles the promise is redundant: a success is in `urls`,
      // and a failure must not be replayed to a caller that could retry. Settle
      // through a derived promise that always resolves, so this bookkeeping can
      // never raise an unhandled rejection of its own.
      const forget = () => {
        if (inflight.current.get(key) === request) {
          inflight.current.delete(key);
        }
      };
      inflight.current.set(key, request);
      void request.then(forget, forget);

      return request;
    },
    [protocolId],
  );
}
