'use client';

import { createContext, type ReactNode, useContext } from 'react';

type SyncFlush = () => Promise<boolean>;

// Components rendered outside a provider (Storybook, unit tests) still need to
// call the flush, so the default is a resolved no-op rather than a throw.
const noopFlush: SyncFlush = () => Promise.resolve(true);

const SyncFlushContext = createContext<SyncFlush>(noopFlush);

export function SyncFlushProvider({
  flush,
  children,
}: {
  flush: SyncFlush;
  children: ReactNode;
}) {
  return (
    <SyncFlushContext.Provider value={flush}>
      {children}
    </SyncFlushContext.Provider>
  );
}

/**
 * Returns a function that writes any pending session state immediately,
 * bypassing the autosave debounce, once the answers still being saved have
 * been stored or refused. It resolves to whether all of them were stored. Await
 * it before handing control back to the host (finishing or closing an
 * interview) so no answers are still in the debounce window, and stay when it
 * resolves false, so the participant sees why an answer was not saved.
 */
export function useSyncFlush(): SyncFlush {
  return useContext(SyncFlushContext);
}
