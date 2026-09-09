import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import { render, type RenderResult } from '@testing-library/react';
import { useMemo, type ReactNode } from 'react';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

import type { ProtocolBuilderClient } from '../../../contract/contract.ts';
import { ProtocolBuilderProvider } from '../../../state/context.ts';
import {
  ResourceClientProvider,
  useResourceClient,
  type ResourceClient,
} from '../../client.tsx';

export type ResourceContextFrameProps = Readonly<{
  client: ProtocolBuilderClient;
  protocolId: string;
  children: ReactNode;
}>;

/**
 * A resource control in the context it really reads: the package's own client
 * context, with the staging tracker around it that every resource control is
 * given, and the dialog provider a browser opens into.
 *
 * The cache and the protocol channel `<ProtocolBuilder>` also mounts are left
 * out. A resource control reads nothing through them, and a test that runs the
 * clock forward would otherwise be answering for a cache's timers rather than
 * for the component under test. A test about a control INSIDE a stage editor
 * wants `renderResourceEditor` instead, which mounts the whole of it.
 */
export function ResourceContextFrame({
  client,
  protocolId,
  children,
}: ResourceContextFrameProps) {
  const value = useMemo(
    () => ({
      client,
      protocolId,
      utils: createTanstackQueryUtils(client),
    }),
    [client, protocolId],
  );

  return (
    <DialogProvider>
      <ProtocolBuilderProvider value={value}>
        <ResourceClientProvider>{children}</ResourceClientProvider>
      </ProtocolBuilderProvider>
    </DialogProvider>
  );
}

export function renderInResourceContext(
  client: ProtocolBuilderClient,
  protocolId: string,
  children: ReactNode,
): RenderResult {
  return render(
    <ResourceContextFrame client={client} protocolId={protocolId}>
      {children}
    </ResourceContextFrame>,
  );
}

/**
 * The resource client a control is given, without a control around it, for the
 * helpers that take one as an argument rather than reading it out of the tree.
 *
 * Read through the returned function rather than held: the client is rebuilt
 * whenever what the edit has staged changes.
 */
export function renderResourceClient(
  client: ProtocolBuilderClient,
  protocolId: string,
): () => ResourceClient {
  const seen: { current: ResourceClient | undefined } = { current: undefined };

  function Probe() {
    seen.current = useResourceClient();
    return null;
  }

  renderInResourceContext(client, protocolId, <Probe />);

  return () => {
    if (seen.current === undefined) {
      throw new Error('the resource client provider rendered nothing');
    }
    return seen.current;
  };
}
