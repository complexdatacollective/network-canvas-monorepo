import { useQueryClient } from '@tanstack/react-query';
import { useRef, type ReactNode } from 'react';

import { useProtocolBuilderContext } from '../state/context.ts';
import type { InMemoryProtocolStore } from './host/protocolStore.ts';

export type SeedProtocolCacheProps = Readonly<{
  store: InMemoryProtocolStore;
  children: ReactNode;
}>;

/**
 * Puts the protocol into the cache before the editor under test renders.
 *
 * A host answers over a promise however near it is, so an editor mounted over
 * one draws nothing on its first pass and fills in a turn later. That is right
 * in an application and wrong in a test: every assertion would have to wait for
 * the editor to exist before it could ask anything about it, which says nothing
 * about the editor and hides the waits that are really about behaviour.
 *
 * So the in-memory host — which holds every answer synchronously — is read
 * directly and written into the cache from this component's render, before
 * React reaches the children that observe it. The LOCK is not taken here: an
 * editor takes its own on mount, and whether that comes back read-only is
 * exactly what a test opening a held section is asking about.
 */
export function SeedProtocolCache({ store, children }: SeedProtocolCacheProps) {
  const queryClient = useQueryClient();
  const { protocolId, utils } = useProtocolBuilderContext();
  const seeded = useRef(false);

  if (!seeded.current) {
    seeded.current = true;
    const sectionIds = store.sectionIds();
    queryClient.setQueryData(
      utils.listSections.queryKey({ input: { protocolId } }),
      { sectionIds },
    );
    for (const id of sectionIds) {
      queryClient.setQueryData(
        utils.getSection.queryKey({ input: { protocolId, sectionId: id } }),
        store.read(id),
      );
    }
  }

  return children;
}

/**
 * The principal the harness's own client speaks as.
 *
 * The same one `createInMemoryHost` is seeded with, because the lock taken here
 * has to be the lock that client holds: taken under any other, the editor's
 * first submit would be refused by the host it is mounted over.
 */
export const HARNESS_PRINCIPAL = {
  sessionId: 'researcher-tab',
  userId: 'researcher',
  displayName: 'Researcher',
};
