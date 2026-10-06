import { QueryClient } from '@tanstack/react-query';

import { refusalOf, retryAfterSeconds } from '../runtime/errors.ts';

const MAX_RETRIES = 3;

const MAINTENANCE_RETRY_MS = 30_000;

const RETRY_FLOOR_MS = 1_000;

export function retryRefusals(failureCount: number, error: unknown): boolean {
  switch (refusalOf(error)?.kind) {
    case 'maintenance':
      return true;
    case 'unauthorized':
    case 'forbidden':
    case 'notFound':
      return false;
    default:
      return failureCount < MAX_RETRIES;
  }
}

export function refusalRetryDelay(
  failureCount: number,
  error: unknown,
): number {
  const seconds = retryAfterSeconds(error);
  if (seconds !== undefined) return Math.max(seconds * 1000, RETRY_FLOOR_MS);
  if (refusalOf(error)?.kind === 'maintenance') return MAINTENANCE_RETRY_MS;
  return Math.min(1000 * 2 ** failureCount, 30_000);
}

// Guard reads must set `retry: false`, or a navigation waits out a maintenance window.
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: retryRefusals, retryDelay: refusalRetryDelay },
    },
  });
}

// The application's one cache. The router carries this exact object in its
// context (§6.1) and `QueryClientProvider` hands the same object to
// components, because they act on each other's entries: a guard's
// `fetchQuery` reads what a component's `queryClient.clear()` removed. Two
// clients would leave the session cached behind a sign-out.
//
// Tests build their own router and provider around one client of their own;
// `createAppRouter` takes it as an argument for exactly that reason.
export const queryClient = createQueryClient();
