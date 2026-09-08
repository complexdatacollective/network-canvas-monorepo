'use client';

import { type Context, createContext, type ReactNode, useRef } from 'react';

import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

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

  // The store is created once and lives as long as the form, so it cannot
  // close over a formatter that changes with the language. It reads this ref
  // instead, which every render points at the current one.
  const intl = useAppIntl();
  const intlRef = useRef<IntlShape>(intl);
  intlRef.current = intl;

  storeRef.current ??= createFormStore({ getIntl: () => intlRef.current });

  return (
    <FormStoreContext.Provider value={storeRef.current}>
      {children}
    </FormStoreContext.Provider>
  );
};

export default FormStoreProvider;
