'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

function createInterviewQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Assets are read from the host, which may serve them from offline
        // storage: a query that waited for the browser to report a connection
        // would never run while offline.
        networkMode: 'always',
        staleTime: Number.POSITIVE_INFINITY,
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });
}

/**
 * The interview's own query cache, so it neither shares one with nor needs one
 * from the host page.
 *
 * Asset ids are only unique within a protocol, and a host may revoke a
 * protocol's asset URLs when it is re-imported, so each protocol the interview
 * is given starts from an empty cache.
 */
export function InterviewQueryClientProvider({
  protocolKey,
  children,
}: {
  protocolKey: string;
  children: ReactNode;
}) {
  const [cache, setCache] = useState(() => ({
    protocolKey,
    client: createInterviewQueryClient(),
  }));
  let { client } = cache;
  if (cache.protocolKey !== protocolKey) {
    client = createInterviewQueryClient();
    setCache({ protocolKey, client });
  }

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
