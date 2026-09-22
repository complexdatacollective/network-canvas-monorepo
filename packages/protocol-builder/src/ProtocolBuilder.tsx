import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import { QueryClientProvider } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';

import type { ProtocolBuilderClient } from '@codaco/protocol-builder-core/contract';

import { DEFAULT_RESOURCE_UPLOAD_MAX_BYTE_LENGTH } from './resources/types.ts';
import { useProtocolChannel } from './state/channel.ts';
import { ProtocolBuilderProvider } from './state/context.ts';
import { createProtocolQueryClient } from './state/queryClient.ts';

export type ProtocolBuilderProps = Readonly<{
  /** The host's contract client — in-process or over a wire; both are typed alike. */
  client: ProtocolBuilderClient;
  protocolId: string;
  /**
   * The largest file, in bytes, this host stores as one resource. The editor
   * refuses anything larger before reading it, so it must be the host's own
   * limit: a larger one reads files the host will only refuse.
   */
  resourceUploadMaxByteLength?: number;
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
  resourceUploadMaxByteLength = DEFAULT_RESOURCE_UPLOAD_MAX_BYTE_LENGTH,
  children,
}: ProtocolBuilderProps) {
  const queryClient = useMemo(() => createProtocolQueryClient(), []);
  const value = useMemo(
    () => ({
      client,
      protocolId,
      resourceUploadMaxByteLength,
      utils: createTanstackQueryUtils(client),
    }),
    [client, protocolId, resourceUploadMaxByteLength],
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
