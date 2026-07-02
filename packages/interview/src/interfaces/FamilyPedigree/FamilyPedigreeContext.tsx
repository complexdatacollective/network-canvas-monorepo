import { invariant } from 'es-toolkit';
import { type ReactNode, createContext, useContext } from 'react';
import { useStore } from 'zustand';

import type { FamilyPedigreeStore, FamilyPedigreeStoreApi } from './store';

export const FamilyPedigreeContext = createContext<
  FamilyPedigreeStoreApi | undefined
>(undefined);

export const useFamilyPedigreeStore = <T,>(
  selector: (state: FamilyPedigreeStore) => T,
) => {
  const store = useContext(FamilyPedigreeContext);
  invariant(
    store,
    'useFamilyPedigreeStore must be used within a FamilyPedigreeProvider',
  );

  return useStore(store, selector);
};

export function FamilyPedigreeStoreBridge({
  store,
  children,
}: {
  store: FamilyPedigreeStoreApi;
  children: ReactNode;
}) {
  return (
    <FamilyPedigreeContext.Provider value={store}>
      {children}
    </FamilyPedigreeContext.Provider>
  );
}
