import type { RegistryStore } from './store.ts';

/** One bounded page per pass, with no overlap and no cursor advance on failure. */
export function startRegistryCleanup({
  store,
  onFailure,
  intervalMs = 60_000,
}: {
  store: Pick<
    RegistryStore,
    'cleanupDeletedArtifacts' | 'cleanupOrphanArtifacts'
  >;
  onFailure: () => void;
  intervalMs?: number;
}) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1)
    throw new Error('REGISTRY_CLEANUP_INTERVAL_INVALID');
  let stopped = false;
  let cursor: string | undefined;
  let pending: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(tick, intervalMs);
    timer.unref();
  };
  const tick = () => {
    if (stopped) return;
    pending = (async () => {
      try {
        await store.cleanupDeletedArtifacts();
        if (stopped) return;
        const result = await store.cleanupOrphanArtifacts(cursor);
        if (!result.retry) cursor = result.nextCursor;
      } catch {
        onFailure();
      } finally {
        pending = undefined;
        schedule();
      }
    })();
  };
  schedule();
  return {
    async stop(): Promise<void> {
      stopped = true;
      clearTimeout(timer);
      await pending;
    },
  };
}
