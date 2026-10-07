import { QueryClientProvider } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import { protocolLocalizationOf } from './localization/localizedText.ts';
import { ProtocolLocalizationProvider } from './localization/ProtocolLocalization.tsx';
import { useProtocolChannel } from './state/channel.ts';
import {
  ProtocolBuilderProvider,
  type ProtocolBuilderAdapter,
} from './state/context.ts';
import { useSection } from './state/hooks.ts';
import { createProtocolQueryClient } from './state/queryClient.ts';

const SETTINGS = sectionId({ kind: 'settings' });

export type ProtocolBuilderProps = Readonly<{
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
        <ProtocolLanguages>{children}</ProtocolLanguages>
      </ProtocolBuilderProvider>
    </QueryClientProvider>
  );
}

function ProtocolChannel({ protocolId }: Readonly<{ protocolId: string }>) {
  useProtocolChannel(protocolId);
  return null;
}

/**
 * The protocol's languages, for every localized field and preview beneath.
 * Read from the settings section alone, so an edit anywhere else in the
 * protocol does not re-render every field that shows protocol copy.
 */
function ProtocolLanguages({ children }: Readonly<{ children?: ReactNode }>) {
  const localization = useSection(SETTINGS, (section) =>
    protocolLocalizationOf(section.document),
  );
  return (
    <ProtocolLocalizationProvider localization={localization}>
      {children}
    </ProtocolLocalizationProvider>
  );
}
