import { QueryClientProvider } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';

import { useProtocolChannel } from './state/channel.ts';
import {
  ProtocolBuilderProvider,
  type ProtocolBuilderAdapter,
} from './state/context.ts';
import { createProtocolQueryClient } from './state/queryClient.ts';

export type ProtocolBuilderProps = Readonly<{
  /**
   * The host's procedures, in-process or over a wire; both are typed alike.
   * Built once by the host: this memoises on its identity.
   */
  adapter: ProtocolBuilderAdapter;
  protocolId: string;
  children?: ReactNode;
}>;

/**
 * Everything the package needs around a protocol's editors: the cache, one
 * channel feeding it, and the adapter every hook calls. A host supplies its
 * adapter and sees nothing of the cache behind this.
 */
export function ProtocolBuilder({
  adapter,
  protocolId,
  children,
}: ProtocolBuilderProps) {
  const queryClient = useMemo(() => createProtocolQueryClient(), []);
  const value = useMemo(() => ({ adapter, protocolId }), [adapter, protocolId]);

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
