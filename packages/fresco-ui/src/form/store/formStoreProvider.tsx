'use client';

import { type Context, createContext, type ReactNode, useRef } from 'react';

import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import type { FieldValue } from '../Field/types';
import { createFormStore, type FormStoreApi } from './formStore';

// Re-exported through the provider because that is the entry consumers already
// import to reach a form store — the selector is useless without one.
export { selectIsFormDirty } from './formStore';

export const FormStoreContext: Context<FormStoreApi | undefined> =
  createContext<FormStoreApi | undefined>(undefined);

type FormStoreProviderProps = {
  /**
   * The document this form is editing.
   *
   * A field with no `initialValue` of its own starts out holding whatever
   * this has at the field's own path, so a form editing a document says so
   * once instead of every field being handed its own starting value. A field
   * that passes `initialValue` still decides for itself.
   */
  initialValues?: Record<string, FieldValue>;
  children: ReactNode;
};

const FormStoreProvider = ({
  initialValues,
  children,
}: FormStoreProviderProps) => {
  const storeRef = useRef<FormStoreApi>(undefined);

  // The store is created once and lives as long as the form, so it cannot
  // close over a formatter that changes with the language. It reads this ref
  // instead, which every render points at the current one.
  const intl = useAppIntl();
  const intlRef = useRef<IntlShape>(intl);
  intlRef.current = intl;

  // The document is read through a ref for the same reason, and one more: a
  // form whose document advances while it is open must seed a field mounting
  // afterwards from what the document holds then.
  const initialValuesRef = useRef(initialValues);
  initialValuesRef.current = initialValues;

  storeRef.current ??= createFormStore({
    getIntl: () => intlRef.current,
    getInitialValues: () => initialValuesRef.current,
  });

  return (
    <FormStoreContext.Provider value={storeRef.current}>
      {children}
    </FormStoreContext.Provider>
  );
};

export default FormStoreProvider;
