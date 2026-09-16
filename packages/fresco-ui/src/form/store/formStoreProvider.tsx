'use client';

import {
  type Context,
  createContext,
  type ReactNode,
  useContext,
  useId,
  useRef,
} from 'react';

import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { createFormStore, type FormStoreApi } from './formStore';

// Re-exported through the provider because that is the entry consumers already
// import to reach a form store — the selector is useless without one.
export { selectIsFormDirty } from './formStore';

export const FormStoreContext: Context<FormStoreApi | undefined> =
  createContext<FormStoreApi | undefined>(undefined);

/**
 * Which form a field on the page belongs to.
 *
 * A form is React state rather than a `<form>` element, so "this form's
 * fields" cannot be answered by DOM containment: a control rendered outside
 * the element — a stage editor's title, drawn by its host above the page the
 * editor sits on — is still one of them, and a control of the form BEHIND a
 * dialog is not, however the two elements happen to nest. Every field stamps
 * this id on its own container (`data-field-form`), so the question has one
 * answer that does not depend on where the markup ended up.
 *
 * `undefined` outside a provider, which is what an `UnconnectedField` and a
 * plain `data-field-name` marker are: they belong to no form store, and
 * nothing scoping by form identity should claim them.
 */
const FormFieldScopeContext: Context<string | undefined> = createContext<
  string | undefined
>(undefined);

/**
 * The identity of the form this component is inside, for anything that has to
 * pick one form's fields out of a whole document — `focusFirstError` is the
 * caller this exists for.
 */
export function useFormFieldScope(): string | undefined {
  return useContext(FormFieldScopeContext);
}

type FormStoreProviderProps = {
  /**
   * The document this form is editing.
   *
   * A field with no `initialValue` of its own starts out holding whatever
   * this has at the field's own path, so a form editing a document says so
   * once instead of every field being handed its own starting value. A field
   * that passes `initialValue` still decides for itself.
   */
  initialValues?: Record<string, unknown>;
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

  // One per provider, so a dialog's form and the page's form behind it are
  // told apart even though both render the same field paths.
  const fieldScope = useId();

  return (
    <FormStoreContext.Provider value={storeRef.current}>
      <FormFieldScopeContext.Provider value={fieldScope}>
        {children}
      </FormFieldScopeContext.Provider>
    </FormStoreContext.Provider>
  );
};

export default FormStoreProvider;
