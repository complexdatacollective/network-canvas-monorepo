import { useState, type ReactNode } from 'react';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

import { ProtocolBuilder } from '../../ProtocolBuilder.tsx';
import { createResourceHost } from '../../resources/components/__tests__/resourceHost.ts';

/**
 * What every host mounts a codebook editor inside: a dialog provider, and a
 * protocol for the shape images a node type imports to be staged into.
 */
export function CodebookEditorHost({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [host] = useState(() => createResourceHost());
  return (
    <DialogProvider>
      <ProtocolBuilder adapter={host.adapter} protocolId={host.protocolId}>
        {children}
      </ProtocolBuilder>
    </DialogProvider>
  );
}
