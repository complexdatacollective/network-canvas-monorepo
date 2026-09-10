import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import { QueryClientProvider } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';

import type { ProtocolBuilderClient } from './contract/contract.ts';
import { useProtocolChannel } from './state/channel.ts';
import { ProtocolBuilderProvider } from './state/context.ts';
import { createProtocolQueryClient } from './state/queryClient.ts';

export type ProtocolBuilderProps = Readonly<{
  /** The host's contract client — in-process or over a wire; both are typed alike. */
  client: ProtocolBuilderClient;
  protocolId: string;
  children?: ReactNode;
}>;

/**
 * Everything the package needs around a protocol's editors: the cache, one
 * channel feeding it, and the client every hook calls. A host supplies its
 * contract client and sees nothing of the state library behind this.
 */
export function ProtocolBuilder({
  client,
  protocolId,
  children,
}: ProtocolBuilderProps) {
  const queryClient = useMemo(() => createProtocolQueryClient(), []);
  const value = useMemo(
    () => ({ client, protocolId, utils: createTanstackQueryUtils(client) }),
    [client, protocolId],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ProtocolBuilderProvider value={value}>
        <ProtocolChannel protocolId={protocolId} />
        {children}
      </ProtocolBuilderProvider>
    </QueryClientProvider>
  );
}

function ProtocolChannel({ protocolId }: Readonly<{ protocolId: string }>) {
  useProtocolChannel(protocolId);
  return null;
}
