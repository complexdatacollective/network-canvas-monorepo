'use client';

import { type Context, createContext, type ReactNode, useRef } from 'react';

import { createFormStore, type FormStoreApi } from './formStore';

// Re-exported through the provider because that is the entry consumers already
// import to reach a form store — the selector is useless without one.
export { selectIsFormDirty } from './formStore';

export const FormStoreContext: Context<FormStoreApi | undefined> =
  createContext<FormStoreApi | undefined>(undefined);

type FormStoreProviderProps = {
  children: ReactNode;
};

const FormStoreProvider = ({ children }: FormStoreProviderProps) => {
  const storeRef = useRef<FormStoreApi>(undefined);

  storeRef.current ??= createFormStore();

  return (
    <FormStoreContext.Provider value={storeRef.current}>
      {children}
    </FormStoreContext.Provider>
  );
};

export default FormStoreProvider;
