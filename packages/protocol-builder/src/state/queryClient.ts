import { QueryClient } from '@tanstack/react-query';

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
      },
    },
  });
}
