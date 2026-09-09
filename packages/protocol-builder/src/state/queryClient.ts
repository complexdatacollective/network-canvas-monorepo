import { QueryClient, replaceEqualDeep } from '@tanstack/react-query';

function sequenceOf(value: unknown): bigint | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const revision = (value as Record<string, unknown>).revision;
  if (typeof revision !== 'object' || revision === null) return undefined;
  const sequence = (revision as Record<string, unknown>).sequence;
  return typeof sequence === 'bigint' ? sequence : undefined;
}

/**
 * Keeps the newer of two revisions of a section, and shares structure
 * otherwise.
 *
 * A `getSection` can still be in flight when the channel writes a newer
 * revision of the same section into the cache. Its answer arrives last and, as
 * nothing here refetches, that older document would then be what every reader
 * of the section sees until the next revision happens to arrive.
 */
function keepTheNewerRevision<TData>(
  previous: TData | undefined,
  next: TData,
): TData {
  if (previous === undefined) return next;
  const before = sequenceOf(previous);
  const after = sequenceOf(next);
  if (before !== undefined && after !== undefined && after < before) {
    return previous;
  }
  return replaceEqualDeep(previous, next);
}

/**
 * The cache `<ProtocolBuilder>` mounts.
 *
 * The protocol channel is the only thing that ever makes a section stale, and
 * it writes the new revision in rather than marking it, so nothing here refetches
 * on its own: `staleTime` is infinite, focus does not refetch, and reconnection
 * is the channel resuming from its cursor rather than TanStack refetching.
 */
export function createProtocolQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        structuralSharing: keepTheNewerRevision,
      },
    },
  });
}
